import 'server-only';

/**
 * Reading the Google Sheets.
 *
 * Read-only by design: the scope requested is `spreadsheets.readonly`, so this
 * app cannot alter a sheet even if asked to. Each workbook's tabs are fetched
 * in one batch request and handed to `importSheet`, which holds the mapping
 * rules.
 */

import { unstable_cache } from 'next/cache';
import { JWT } from 'google-auth-library';
import type { AccessEntry } from './access';
import { env, serviceAccount } from './env';
import { ACCESS_TAB, MASTER_TABS, PIPELINE_HEADER_CELL, PIPELINE_TABS, ROW_NUMBER, importAccess, importSheet, type SheetRow, type SheetTables } from './sheet-import';
import type { DashboardData } from './types';

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

let client: JWT | null = null;

function authClient(): JWT {
  if (client) return client;
  const credentials = serviceAccount();
  client = new JWT({ email: credentials.client_email, key: credentials.private_key, scopes: SCOPES });
  return client;
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Header row plus data rows become one object per row, keyed by header text.
 * The header is the first row, or the first row holding `headerCell`. Each
 * row also carries its row number in the sheet, for messages about it.
 */
function toRows(values: unknown[][], headerCell?: string): SheetRow[] {
  const at = headerCell ? values.findIndex((row) => row.some((cell) => normalize(String(cell ?? '')) === normalize(headerCell))) : 0;
  if (at < 0) return [];
  const [header = [], ...body] = values.slice(at);
  const keys = header.map((h) => String(h ?? '').trim());
  const rows: SheetRow[] = [];
  body.forEach((raw, i) => {
    if (raw.every((cell) => cell === '' || cell === null || cell === undefined)) return;
    // Sheet rows count from 1, and the header row sits above the first data row.
    const row: SheetRow = { [ROW_NUMBER]: at + i + 2 };
    keys.forEach((key, i) => {
      if (key) row[key] = raw[i] ?? '';
    });
    rows.push(row);
  });
  return rows;
}

interface BatchGetResponse {
  valueRanges?: Array<{ range?: string; values?: unknown[][] }>;
}

/** Group "Tab row N: reason" lines into one count per tab and reason. */
function summarizeErrors(errors: string[]): DashboardData['skippedRows'] {
  const groups = new Map<string, { tab: string; count: number; reason: string }>();
  for (const line of errors) {
    const match = /^(\w+) row \d+(?: \([^)]*\))?: (.+)$/.exec(line);
    const tab = match?.[1] ?? 'Sheet';
    const reason = match?.[2] ?? line;
    const key = `${tab}|${reason}`;
    const group = groups.get(key) ?? { tab, count: 0, reason };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The named tabs of one workbook, as raw values, and the names it lacks. */
async function readTabs<T extends string>(sheetId: string, names: readonly T[]): Promise<{ values: Partial<Record<T, unknown[][]>>; missing: T[] }> {
  const auth = authClient();
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}`;

  const meta = await auth.request<{ sheets?: Array<{ properties?: { title?: string } }> }>({ url: `${base}?fields=sheets.properties.title` });
  const titles = (meta.data.sheets ?? []).map((s) => s.properties?.title).filter((t): t is string => Boolean(t));
  const titleFor = new Map(titles.map((t) => [normalize(t), t]));

  const present = names.filter((name) => titleFor.has(normalize(name)));
  const missing = names.filter((name) => !titleFor.has(normalize(name)));

  const values: Partial<Record<T, unknown[][]>> = {};
  if (present.length) {
    const params = present.map((name) => `ranges=${encodeURIComponent(`'${titleFor.get(normalize(name))!}'`)}`).join('&');
    const response = await auth.request<BatchGetResponse>({ url: `${base}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE` });
    const ranges = response.data.valueRanges ?? [];
    present.forEach((name, i) => {
      values[name] = ranges[i]?.values ?? [];
    });
  }
  return { values, missing };
}

export async function readSheet(): Promise<DashboardData> {
  const { GOOGLE_SHEET_ID, GOOGLE_PIPELINE_SHEET_ID } = env();
  const [master, pipe] = await Promise.all([readTabs(GOOGLE_SHEET_ID, MASTER_TABS), readTabs(GOOGLE_PIPELINE_SHEET_ID, PIPELINE_TABS)]);

  const tables: SheetTables = {};
  for (const name of MASTER_TABS) if (master.values[name]) tables[name] = toRows(master.values[name]);
  if (pipe.values.Pipeline) tables.Pipeline = toRows(pipe.values.Pipeline, PIPELINE_HEADER_CELL);
  if (pipe.values.Probability) tables.Probability = toRows(pipe.values.Probability);

  const { errors, ...records } = importSheet(tables);
  return { ...records, missingTabs: [...master.missing, ...pipe.missing], skippedRows: summarizeErrors(errors), fetchedAt: new Date().toISOString() };
}

let cachedRead: (() => Promise<DashboardData>) | null = null;

/**
 * The sheets, read at most once per `SHEET_REVALIDATE_SECONDS`. A burst of
 * page views then costs one read, which keeps the app inside Google's quota.
 */
export function readSheetCached(): Promise<DashboardData> {
  const seconds = env().SHEET_REVALIDATE_SECONDS;
  if (!seconds) return readSheet();
  cachedRead ??= unstable_cache(readSheet, ['dashboard-sheet'], { revalidate: seconds, tags: ['dashboard'] });
  return cachedRead();
}

async function readAccess(): Promise<AccessEntry[]> {
  const { values } = await readTabs(env().GOOGLE_SHEET_ID, [ACCESS_TAB]);
  return importAccess(toRows(values[ACCESS_TAB] ?? []));
}

let cachedAccess: (() => Promise<AccessEntry[]>) | null = null;

/**
 * The people in the master workbook's Access tab, read on the same schedule
 * as the figures. A change there takes effect within
 * `SHEET_REVALIDATE_SECONDS`.
 */
export function readAccessCached(): Promise<AccessEntry[]> {
  const seconds = env().SHEET_REVALIDATE_SECONDS;
  if (!seconds) return readAccess();
  cachedAccess ??= unstable_cache(readAccess, ['dashboard-access'], { revalidate: seconds, tags: ['dashboard'] });
  return cachedAccess();
}

/** Turn a Google failure into a message that says what to fix. */
export function describeSheetError(error: unknown): string {
  const err = error as { response?: { status?: number; data?: { error?: { message?: string } } }; message?: string };
  const status = err?.response?.status;
  const detail = err?.response?.data?.error?.message ?? err?.message ?? 'Unknown Google Sheets error';
  if (status === 403) return `${detail}. Share both spreadsheets with the service account as a Viewer.`;
  if (status === 404) return `${detail}. Check GOOGLE_SHEET_ID and GOOGLE_PIPELINE_SHEET_ID match the spreadsheet URLs.`;
  if (status === 429) return `${detail}. Google Sheets rate limit reached; try again shortly.`;
  return detail;
}
