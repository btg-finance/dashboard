/**
 * Domain types: the records the dashboard works with, produced from the
 * Google Sheets by `sheet-import.ts`.
 */

/** A month key in `YYYY-MM` form. */
export type YearMonth = string;

/** A financial year, named by the calendar year it ends in. FY27 = Apr 2026 to Mar 2027. */
export type FinancialYear = number;

export type Period = 'all' | 'h1' | 'h2' | 'q1' | 'q2' | 'q3' | 'q4';

export interface Project {
  id: number;
  ym: YearMonth;
  name: string;
  client: string;
  industry: string;
  /** Service vertical, e.g. "Content and Production". */
  scat: string;
  de: 'Domestic' | 'Export';
  recurring: boolean;
  revenue: number;
  cost: number;
  grossProfit: number;
}

/** One open opportunity. All of its revenue lands in the month the project starts. */
export interface PipeRow {
  n: string;
  client: string;
  owner: string;
  /** Service line, the same names the Projects tab uses. */
  v: string;
  stage: string;
  /** The stage's probability, 0 to 1, from the pipeline workbook. */
  p: number;
  /** Direct cost as a fraction of revenue. */
  cp: number;
  start: YearMonth;
  fy: FinancialYear;
  /** Gross value in whole rupees. */
  rev: number;
}

/** Committed pipeline is 75% and above; the rest is weighted pipeline. */
export type PipeKind = 'committed' | 'weighted';

export interface QuarterTarget {
  rev: number;
  gp: number;
}

export interface Overhead {
  m: YearMonth;
  sal: number;
  opex: number;
  total: number;
}

export interface Target {
  rev: number;
  gp: number;
  ebitda: number;
  gpPct: number;
  /** Q1 to Q4, present only when the sheet gives all four quarter rows. */
  q?: QuarterTarget[];
}

/** Everything the dashboard reads, in one payload. */
export interface DashboardData {
  projects: Project[];
  pipeline: PipeRow[];
  overheads: Overhead[];
  /** Keyed by financial year, e.g. `{ "2027": {...} }`. */
  targets: Record<string, Target>;
  /** Tabs the sheet was missing, so the UI can say what is absent rather than showing zeros. */
  missingTabs: string[];
  /** Required columns a tab does not have. Figures that depend on them cannot be trusted. */
  missingColumns: Array<{ tab: string; column: string }>;
  /** Rows dropped because a required value could not be read, counted per tab. */
  skippedRows: Array<{ tab: string; count: number; reason: string }>;
  /** When the sheet was last read, as an ISO string. */
  fetchedAt: string;
}

export interface SessionUser {
  email: string;
  name: string;
}
