/**
 * Who may see what.
 *
 * Each person has a role, set in the Access tab of the master workbook:
 *
 *  - Full      every page, the chat, and exports.
 *  - Viewer    every page and the chat, no exports.
 *  - Limited   only the pages ticked for them, the chat only if ticked, no exports.
 *
 * Pure functions, so the rules can be checked without Google or a browser.
 */

export const PAGES = [
  { key: 'exec', href: '/exec', label: 'Executive Summary' },
  { key: 'forecast', href: '/forecast', label: 'Forecast' },
  { key: 'insights', href: '/insights', label: 'Business Insights' },
  { key: 'pl', href: '/pl', label: 'P&L' },
  { key: 'history', href: '/history', label: 'Historical Performance' },
  { key: 'projects', href: '/projects', label: 'Projects' },
] as const;

export type PageKey = (typeof PAGES)[number]['key'];
export type Role = 'full' | 'viewer' | 'limited';

/** The column in the Access tab that grants the chat to a Limited person. */
export const CHAT_COLUMN = 'Chat';

const ALL_PAGES: PageKey[] = PAGES.map((page) => page.key);

/** One row of the Access tab. */
export interface AccessEntry {
  email: string;
  role: Role;
  /** The pages ticked for this person. Only a Limited role is held to them. */
  pages: PageKey[];
  chat: boolean;
  /** Last day of access as `YYYY-MM-DD`, or empty for no end date. */
  expires: string;
}

/** What a signed-in person may do. */
export interface Access {
  role: Role;
  pages: PageKey[];
  chat: boolean;
  canExport: boolean;
}

export const FULL_ACCESS: Access = { role: 'full', pages: ALL_PAGES, chat: true, canExport: true };

/** What someone gets before their access is known: nothing. */
export const NO_ACCESS: Access = { role: 'limited', pages: [], chat: false, canExport: false };

/** A role from the sheet. A blank cell is a Viewer; anything unrecognised is Limited, the narrowest. */
export function roleFrom(text: string): Role {
  const role = text.trim().toLowerCase();
  if (!role) return 'viewer';
  return role === 'full' || role === 'viewer' ? role : 'limited';
}

/** Today's date in India, where the dashboard's users are, as `YYYY-MM-DD`. */
export function todayInIndia(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
}

/** What this row grants on the given day, or null once it has expired. The expiry date itself still counts. */
export function accessFrom(entry: AccessEntry, today: string): Access | null {
  if (entry.expires && entry.expires < today) return null;
  if (entry.role === 'full') return FULL_ACCESS;
  if (entry.role === 'viewer') return { role: 'viewer', pages: ALL_PAGES, chat: true, canExport: false };
  return { role: 'limited', pages: entry.pages, chat: entry.chat, canExport: false };
}

/** The page a path belongs to, or null for a path that is not a dashboard page. */
export function pageOfPath(pathname: string): PageKey | null {
  return PAGES.find((page) => pathname === page.href || pathname.startsWith(`${page.href}/`))?.key ?? null;
}

/** Where to send someone who may not open the page they asked for: their first permitted page. */
export function homeFor(access: Access): string | null {
  return PAGES.find((page) => access.pages.includes(page.key))?.href ?? null;
}
