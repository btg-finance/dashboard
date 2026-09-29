/**
 * Turning the sheets' tabs into the dashboard's records.
 *
 * Two workbooks feed the dashboard. The master workbook has Projects,
 * Overheads and Targets; the pipeline workbook has Pipeline and Probability.
 * This is the mapping, with no I/O.
 *
 *  - Projects rows are reported work: month, client, industry, vertical,
 *    retainer flag, domestic or export, revenue and direct cost.
 *  - Pipeline rows are open opportunities, in rupees lakh. Each has a stage
 *    and a start month; all of its revenue lands in that month.
 *  - Probability maps each stage to its probability. A stage at zero, such as
 *    Lost, keeps the opportunity off the dashboard.
 *  - Overheads are salaries and operating expenses per month.
 *  - Targets are annual, with optional quarter rows such as `FY27-Q1`.
 */

import { DEFAULT_GP_PCT, fyOf } from './model';
import type { DashboardData, Overhead, PipeRow, Project, QuarterTarget, Target, YearMonth } from './types';

/** One sheet row, keyed by the header text as it appears in the sheet. */
export type SheetRow = Record<string, unknown>;

/** The key under which a row carries its own row number in the sheet. */
export const ROW_NUMBER = '__row';

export interface SheetTables {
  Projects?: SheetRow[];
  Overheads?: SheetRow[];
  Targets?: SheetRow[];
  Pipeline?: SheetRow[];
  Probability?: SheetRow[];
}

export const MASTER_TABS = ['Projects', 'Overheads', 'Targets'] as const;
export const PIPELINE_TABS = ['Pipeline', 'Probability'] as const;

/** The Pipeline tab has banner rows above its headers; this cell marks the header row. */
export const PIPELINE_HEADER_CELL = 'Project Name';

/** The columns each tab must have. Without one of these the figures would be wrong, not just incomplete. */
const REQUIRED_COLUMNS: Record<keyof SheetTables, string[]> = {
  Projects: ['Month', 'Project', 'Client', 'Revenue', 'DirectCost'],
  Overheads: ['Month', 'SalariesAndFees', 'OperatingExpenses'],
  Targets: ['FY', 'RevenueTarget', 'GrossProfitTarget'],
  Pipeline: ['Project Name', 'Stage', 'Project Start Month', 'Revenue (Rs L)', 'Cost (Rs L)'],
  Probability: ['Stage', 'Probability'],
};

export interface ImportResult {
  projects: Project[];
  pipeline: PipeRow[];
  overheads: Overhead[];
  targets: Record<string, Target>;
  missingColumns: DashboardData['missingColumns'];
  /** One line per row that had to be skipped, e.g. "Projects row 12: unreadable Month". */
  errors: string[];
}

const LAKH = 100000;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Required columns that a tab's header row does not have. A tab with no rows is not checked. */
function findMissingColumns(tables: SheetTables): DashboardData['missingColumns'] {
  const missing: DashboardData['missingColumns'] = [];
  for (const tab of Object.keys(REQUIRED_COLUMNS) as Array<keyof SheetTables>) {
    const first = tables[tab]?.[0];
    if (!first) continue;
    const present = new Set(Object.keys(first).map(normalize));
    for (const column of REQUIRED_COLUMNS[tab]) {
      if (!present.has(normalize(column))) missing.push({ tab, column });
    }
  }
  return missing;
}

/** Tolerant column lookup: ignores case, spaces and punctuation in the header. */
function rowGetter(row: SheetRow): (name: string) => unknown {
  const map: Record<string, unknown> = {};
  for (const key of Object.keys(row)) map[normalize(key)] = row[key];
  return (name) => {
    const v = map[normalize(name)];
    return v === undefined ? '' : v;
  };
}

/** The row's number in the sheet, for messages a person can act on. */
const rowNo = (row: SheetRow): number => Number(row[ROW_NUMBER]) || 0;

const str = (v: unknown): string => String(v ?? '').trim();

/** A number from a cell, tolerating rupee signs and grouping commas. */
export function xnum(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[₹,\s]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

const xbool = (v: unknown): boolean => /^(y|yes|true|1)$/i.test(str(v));

/** A probability from `0.75`, `75` or `75%`, as a fraction. */
function xprob(v: unknown): number {
  const n = xnum(str(v).replace(/%$/, ''));
  return n > 1 ? n / 100 : n;
}

const ym = (year: string | number, month: number): YearMonth => `${year}-${String(month).padStart(2, '0')}`;

/**
 * A `YYYY-MM` month from a cell: a spreadsheet date serial, an ISO string,
 * `MM/YYYY`, or text naming a month and a year such as `Oct-2026`,
 * `1 Oct 2026` or `October 1, 2026`. Text is read as written, never through
 * the machine's time zone, so every machine reads the same month.
 */
export function xmonth(v: unknown): YearMonth {
  if (typeof v === 'number' && v > 20000 && v < 60000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return ym(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  const s = str(v);
  if (!s) return '';
  let m = s.match(/^(\d{4})[-\/](\d{1,2})(?!\d)/);
  if (m) return ym(m[1]!, +m[2]!);
  m = s.match(/^(\d{1,2})[-\/](\d{4})$/);
  if (m) return ym(m[2]!, +m[1]!);

  const name = s.match(/[a-z]{3,}/i)?.[0].slice(0, 3).toLowerCase();
  const month = name ? MONTHS.indexOf(name) + 1 : 0;
  if (!month) return '';
  const year = s.match(/\b\d{4}\b/)?.[0] ?? s.match(/[-\s'’](\d{2})$/)?.[1];
  if (!year) return '';
  return ym(year.length === 2 ? `20${year}` : year, month);
}

/** A financial year from `FY27`, `2027` or `27`. Zero when unreadable. */
function xfy(v: unknown): number {
  const s = str(v).toUpperCase().replace(/^FY/, '');
  if (/^\d{4}$/.test(s)) return +s;
  if (/^\d{2}$/.test(s)) return 2000 + +s;
  return 0;
}

function importProjects(rows: SheetRow[], errors: string[]): Project[] {
  const projects: Project[] = [];
  for (const row of rows) {
    const g = rowGetter(row);
    const month = xmonth(g('Month'));
    if (!month) {
      errors.push(`Projects row ${rowNo(row)}: unreadable Month`);
      continue;
    }
    const revenue = xnum(g('Revenue'));
    const cost = xnum(g('DirectCost')) || xnum(g('Cost'));
    projects.push({
      id: projects.length,
      ym: month,
      name: str(g('Project')) || str(g('Name')) || 'Untitled',
      client: str(g('Client')),
      industry: str(g('Industry')),
      scat: str(g('ServiceType')) || str(g('Vertical')) || 'Others',
      de: /exp/i.test(str(g('DomesticExport'))) ? 'Export' : 'Domestic',
      recurring: xbool(g('Retainer')),
      revenue,
      cost,
      grossProfit: revenue - cost,
    });
  }
  return projects;
}

function importPipeline(rows: SheetRow[], probability: SheetRow[], errors: string[]): PipeRow[] {
  const stageP: Record<string, number> = {};
  for (const row of probability) {
    const g = rowGetter(row);
    const stage = str(g('Stage'));
    if (stage) stageP[stage.toLowerCase()] = xprob(g('Probability'));
  }

  const pipeline: PipeRow[] = [];
  for (const row of rows) {
    const g = rowGetter(row);
    const n = str(g('Project Name'));
    const stage = str(g('Stage'));
    const rev = xnum(g('Revenue (Rs L)')) * LAKH;
    // Rows without a name, stage or value are totals and blanks, not opportunities.
    if (!n || !stage || !rev) continue;
    const p = stageP[stage.toLowerCase()] ?? xprob(g('Probability'));
    if (!p) continue;
    const start = xmonth(g('Project Start Month'));
    if (!start) {
      errors.push(`Pipeline row ${rowNo(row)} (${n}): Project Start Month is missing`);
      continue;
    }
    pipeline.push({
      n,
      client: str(g('Client Name')),
      owner: str(g('Owner')),
      v: str(g('Service Line')) || 'Others',
      stage,
      p,
      cp: (xnum(g('Cost (Rs L)')) * LAKH) / rev,
      start,
      fy: fyOf(start),
      rev,
    });
  }
  return pipeline;
}

function importOverheads(rows: SheetRow[], errors: string[]): Overhead[] {
  const overheads: Overhead[] = [];
  for (const row of rows) {
    const g = rowGetter(row);
    const m = xmonth(g('Month'));
    if (!m) {
      errors.push(`Overheads row ${rowNo(row)}: unreadable Month`);
      continue;
    }
    const sal = xnum(g('SalariesAndFees')) || xnum(g('Salaries'));
    const opex = xnum(g('OperatingExpenses')) || xnum(g('Opex'));
    overheads.push({ m, sal, opex, total: sal + opex });
  }
  return overheads.sort((a, b) => a.m.localeCompare(b.m));
}

function importTargets(rows: SheetRow[], errors: string[]): Record<string, Target> {
  const targets: Record<string, Target> = {};
  const quarters: Record<string, Array<QuarterTarget | undefined>> = {};
  for (const row of rows) {
    const g = rowGetter(row);
    const rev = xnum(g('RevenueTarget')) || xnum(g('Revenue'));
    const gpPct = xnum(g('TargetGPPct')) || xnum(g('GPpct')) || DEFAULT_GP_PCT;
    const gp = xnum(g('GrossProfitTarget')) || xnum(g('GrossProfit')) || (rev * gpPct) / 100;
    const quarter = /^(.+)-Q([1-4])$/i.exec(str(g('FY')));
    const fy = xfy(quarter ? quarter[1] : g('FY'));
    // Label rows such as "Quarterly targets" carry neither a year nor an amount.
    if (!fy && !rev) continue;
    if (!fy || !rev) {
      errors.push(`Targets row ${rowNo(row)}: FY and RevenueTarget are required`);
      continue;
    }
    if (quarter) (quarters[String(fy)] ??= [])[+quarter[2]! - 1] = { rev, gp };
    else targets[String(fy)] = { rev, gp, ebitda: xnum(g('EBITDATarget')) || xnum(g('EBITDA')), gpPct };
  }
  // Quarter targets count only when all four are given; a partial set would understate the year.
  for (const [fy, qs] of Object.entries(quarters)) {
    const target = targets[fy];
    const all = [0, 1, 2, 3].map((q) => qs[q]).filter((q): q is QuarterTarget => Boolean(q));
    if (target && all.length === 4) target.q = all;
  }
  return targets;
}

export function importSheet(tables: SheetTables): ImportResult {
  const errors: string[] = [];
  return {
    projects: importProjects(tables.Projects ?? [], errors),
    pipeline: importPipeline(tables.Pipeline ?? [], tables.Probability ?? [], errors),
    overheads: importOverheads(tables.Overheads ?? [], errors),
    targets: importTargets(tables.Targets ?? [], errors),
    missingColumns: findMissingColumns(tables),
    errors,
  };
}
