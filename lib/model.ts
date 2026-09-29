/**
 * Every calculation behind the dashboard: financial-year helpers,
 * formatting, aggregation, targets and pace, and pipeline weighting.
 *
 * `buildModel` binds them to one payload from the sheets, so a page asks the
 * model for a figure instead of working it out. Pure functions, no DOM.
 */

import type { DashboardData, FinancialYear, Overhead, Period, PipeKind, PipeRow, Project, Target, YearMonth } from './types';

/* ── financial year · Apr → Mar, labelled by end year ─────────────────────── */

export const fyOf = (ym: YearMonth): FinancialYear => {
  const [y, m] = ym.split('-').map(Number);
  return m! >= 4 ? y! + 1 : y!;
};
export const fyLabel = (fy: FinancialYear): string => `FY${String(fy).slice(2)}`;
export const fyMonths = (fy: FinancialYear): YearMonth[] => {
  const a: YearMonth[] = [];
  for (let m = 4; m <= 12; m++) a.push(`${fy - 1}-${String(m).padStart(2, '0')}`);
  for (let m = 1; m <= 3; m++) a.push(`${fy}-0${m}`);
  return a;
};
export const qOf = (ym: YearMonth): number => {
  const m = +ym.split('-')[1]!;
  return m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
};
export const qMonths = (fy: FinancialYear, q: number): YearMonth[] => fyMonths(fy).slice((q - 1) * 3, q * 3);
const PERIODS: Record<Period, [number, number]> = { all: [0, 12], h1: [0, 6], h2: [6, 12], q1: [0, 3], q2: [3, 6], q3: [6, 9], q4: [9, 12] };
export const periodMonths = (fy: FinancialYear, p: Period): YearMonth[] => fyMonths(fy).slice(...(PERIODS[p] ?? [0, 12]));
export const PLABEL: Record<Period, string> = {
  all: 'Full Year',
  h1: 'H1 · Apr–Sep',
  h2: 'H2 · Oct–Mar',
  q1: 'Q1 · Apr–Jun',
  q2: 'Q2 · Jul–Sep',
  q3: 'Q3 · Oct–Dec',
  q4: 'Q4 · Jan–Mar',
};
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MLONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const mLabel = (ym: YearMonth): string => {
  const [y, m] = ym.split('-').map(Number);
  return `${MN[m! - 1]} '${String(y).slice(2)}`;
};
export const mLong = (ym: YearMonth): string => {
  const [y, m] = ym.split('-').map(Number);
  return `${MLONG[m! - 1]} ${y}`;
};
export const prevYM = (m: YearMonth): YearMonth => {
  const [y, mo] = m.split('-').map(Number);
  return `${y! - 1}-${String(mo).padStart(2, '0')}`;
};
export const prevMonths = (months: YearMonth[]): YearMonth[] => months.map(prevYM);

/* ── formatting ──────────────────────────────────────────────────────────── */

export const fmt = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(a >= 1e9 ? 0 : 2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(1)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(0)}k`;
  return `${s}₹${Math.round(a)}`;
};
export const fmtCr = (v: number | null | undefined): string => {
  if (v == null || Number.isNaN(v)) return '—';
  const c = v / 1e7;
  const a = Math.abs(c);
  return `${c < 0 ? '−' : ''}₹${a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2)} Cr`;
};
export const fmtP = (v: number | null | undefined, d = 1): string => (v == null || Number.isNaN(v) ? '—' : `${v.toFixed(d)}%`);
export const pct = (a: number, b: number): number | null => (b > 0 ? (a / b) * 100 : null);
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const pcls = (v: number): 'up' | 'dn' => (v >= 0 ? 'up' : 'dn');

/** The chart's compact bar label: `1.2Cr`, `85L`, `40k`. */
export const lblFmt = (v: number): string => {
  const a = Math.abs(v);
  const s = v < 0 ? '−' : '';
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(0)}L`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}k`;
  return `${s}${Math.round(a)}`;
};

/** The change from `prev` to `cur`: a percentage, or points when comparing two percentages. */
export interface Delta {
  cls: 'flat' | 'up' | 'down';
  text: string;
}
export function delta(cur: number | null | undefined, prev: number | null | undefined, opt: { pts?: boolean } = {}): Delta {
  if (prev == null || !prev || cur == null) return { cls: 'flat', text: '—' };
  const d = opt.pts ? cur - prev : ((cur - prev) / Math.abs(prev)) * 100;
  const up = d >= 0;
  const cls = Math.abs(d) < 0.05 ? 'flat' : up ? 'up' : 'down';
  const arrow = Math.abs(d) < 0.05 ? '' : up ? '▲' : '▼';
  return { cls, text: `${arrow} ${Math.abs(d).toFixed(opt.pts ? 1 : 0)}${opt.pts ? ' pts' : '%'}` };
}

/* ── pipeline ────────────────────────────────────────────────────────────── */

/** From this probability up, an opportunity counts as committed pipeline. */
export const COMMITTED_FROM = 0.75;
export const kindOf = (r: PipeRow): PipeKind => (r.p >= COMMITTED_FROM ? 'committed' : 'weighted');

/** The gross margin floor used when the sheet sets none for the year. */
export const DEFAULT_GP_PCT = 37;

/* ── aggregation ─────────────────────────────────────────────────────────── */

export const sum = <T>(a: T[], f: (x: T) => number | null | undefined): number => a.reduce((s, x) => s + (f(x) || 0), 0);

export interface Agg {
  rev: number;
  cost: number;
  gp: number;
  gm: number | null;
  n: number;
  clients: number;
  avg: number | null;
}
export function agg(rows: Project[]): Agg {
  const rev = sum(rows, (p) => p.revenue);
  const cost = sum(rows, (p) => p.cost);
  return { rev, cost, gp: rev - cost, gm: pct(rev - cost, rev), n: rows.length, clients: new Set(rows.map((p) => p.client)).size, avg: rows.length ? rev / rows.length : null };
}
export function groupBy<T>(ps: T[], f: (p: T) => string): Record<string, T[]> {
  const g: Record<string, T[]> = {};
  for (const p of ps) (g[f(p) || '—'] ??= []).push(p);
  return g;
}

export interface OhSummary {
  sal: number;
  opex: number;
  total: number;
  n: number;
  covered: boolean;
}

/* ── the model ───────────────────────────────────────────────────────────── */

export interface TrendPeriod {
  label: string;
  months: YearMonth[];
  partial: boolean;
}

export interface ExecKpiData {
  rep: YearMonth[];
  a: Agg;
  pa: Agg;
  oh: OhSummary;
  ohOK: boolean;
  eb: number | null;
  ebPct: number | null;
  ebPrevPct: number | null;
  T: Target | null;
  tRev: number | null;
  tGP: number | null;
  expRev: number | null;
  expGP: number | null;
  tEbPct: number | null;
}

export interface Model {
  P: Project[];
  PIPE: PipeRow[];
  OH: Overhead[];
  TGT: Record<string, Target>;
  ohMap: Record<YearMonth, Overhead>;
  FYS: FinancialYear[];
  /** The last month with a reported project. */
  dataThrough: YearMonth;
  todayM: YearMonth;
  curFY: FinancialYear;
  curQ: number;
  /** Vertical colours, assigned in order of first appearance. */
  vColor: Record<string, string>;
  reported: (months: YearMonth[]) => YearMonth[];
  inMonths: (months: YearMonth[]) => Project[];
  ohFor: (months: YearMonth[]) => OhSummary;
  targetFor: (fy: FinancialYear) => Target | null;
  /** The year's gross margin target, in percent. */
  gpFloor: (fy: FinancialYear) => number;
  /** The year the dashboard opens on: the current one when it has data, else the latest with data. */
  defaultFY: FinancialYear;
  hasPrevFullYear: (fy: FinancialYear) => boolean;
  /** Share of an annual target that falls in these months, by last year's shape. */
  seasonShare: (fy: FinancialYear, months: YearMonth[]) => number;
  /** The target for these months: the sheet's quarter targets when it has them, else the annual one split by season. */
  targetIn: (fy: FinancialYear, months: YearMonth[], key: 'rev' | 'gp') => number | null;
  pipeRows: (fy: FinancialYear) => PipeRow[];
  /** Opportunities starting in the open months among these: gross, weighted, and weighted gross profit. */
  pipeInMonths: (fy: FinancialYear, months: YearMonth[], kind?: PipeKind) => { val: number; w: number; gp: number };
  /**
   * Opportunities the forecast cannot count: their start month is already
   * reported, so they are either in Projects by now or have slipped.
   */
  pipeOverdue: (fy: FinancialYear, months: YearMonth[]) => PipeRow[];
  trendPeriods: (mode: 'm' | 'q' | 'y', needOH: boolean) => TrendPeriod[];
  execKpiData: (fy: FinancialYear, months: YearMonth[]) => ExecKpiData;
}

/** Series colours, matching the stylesheet's tokens. */
export const C = {
  gold: '#c8922a',
  sage: '#386c05',
  rust: '#c0442a',
  slate: '#213d4d',
  ink: '#000000',
  ink2: '#414141',
  ink3: '#767676',
  grid: '#ebe8e3',
  goldA: 'rgba(200,146,42,.8)',
  sageA: 'rgba(56,108,5,.8)',
  slateA: 'rgba(33,61,77,.8)',
  rustA: 'rgba(192,68,42,.78)',
};
export const MIX_COLORS = [C.slate, C.sage, C.gold, '#8f6b3f', C.rust, '#9a938a', '#b0a99e'];

export function buildModel(data: DashboardData, now: Date = new Date()): Model {
  const P = data.projects;
  const PIPE = data.pipeline;
  const OH = data.overheads;
  const TGT = data.targets;
  const ohMap: Record<YearMonth, Overhead> = {};
  for (const o of OH) ohMap[o.m] = o;

  const dataThrough = P.map((p) => p.ym).sort().pop() ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const todayM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const anchor = todayM > dataThrough ? dataThrough : todayM;
  const curFY = fyOf(anchor);
  const curQ = qOf(anchor);
  const FYS = [...new Set(P.map((p) => fyOf(p.ym)))].sort((a, b) => a - b);

  const vColor: Record<string, string> = {};
  [...new Set(P.map((p) => p.scat))].forEach((v, i) => {
    vColor[v] = MIX_COLORS[i % MIX_COLORS.length]!;
  });

  const reported = (months: YearMonth[]) => months.filter((m) => m <= dataThrough);
  const inMonths = (months: YearMonth[]) => {
    const s = new Set(months);
    return P.filter((p) => s.has(p.ym));
  };
  const ohFor = (months: YearMonth[]): OhSummary => {
    const rep = months.filter((m) => m <= dataThrough);
    const rows = rep.map((m) => ohMap[m]).filter((o): o is Overhead => Boolean(o));
    return { sal: sum(rows, (o) => o.sal), opex: sum(rows, (o) => o.opex), total: sum(rows, (o) => o.total), n: rows.length, covered: rep.length > 0 && rep.every((m) => Boolean(ohMap[m])) };
  };
  const targetFor = (fy: FinancialYear) => TGT[String(fy)] ?? null;
  const gpFloor = (fy: FinancialYear) => targetFor(fy)?.gpPct || DEFAULT_GP_PCT;
  const defaultFY = FYS.includes(curFY) ? curFY : (FYS[FYS.length - 1] ?? curFY);
  const hasPrevFullYear = (fy: FinancialYear) => {
    const pm = fyMonths(fy - 1);
    return pm.every((m) => m <= dataThrough) && sum(inMonths(pm), (p) => p.revenue) > 0;
  };
  const seasonShare = (fy: FinancialYear, months: YearMonth[]) => {
    if (!months.length) return 0;
    if (!hasPrevFullYear(fy)) return months.length / 12;
    const prevAll = inMonths(fyMonths(fy - 1));
    const tot = sum(prevAll, (p) => p.revenue);
    const s = new Set(prevMonths(months));
    return sum(prevAll.filter((p) => s.has(p.ym)), (p) => p.revenue) / tot;
  };
  const targetIn = (fy: FinancialYear, months: YearMonth[], key: 'rev' | 'gp') => {
    const T = targetFor(fy);
    if (!T) return null;
    if (!T.q) return T[key] * seasonShare(fy, months);
    return T.q.reduce((total, quarter, i) => {
      const qm = qMonths(fy, i + 1);
      const sel = months.filter((m) => qm.includes(m));
      if (!sel.length) return total;
      const whole = seasonShare(fy, qm);
      return total + quarter[key] * (whole ? seasonShare(fy, sel) / whole : sel.length / qm.length);
    }, 0);
  };
  const pipeRows = (fy: FinancialYear) => PIPE.filter((r) => r.fy === fy);
  const pipeInMonths = (fy: FinancialYear, months: YearMonth[], kind?: PipeKind) => {
    const rows = pipeRows(fy).filter((r) => (!kind || kindOf(r) === kind) && r.start > dataThrough && months.includes(r.start));
    return { val: sum(rows, (r) => r.rev), w: sum(rows, (r) => r.rev * r.p), gp: sum(rows, (r) => r.rev * r.p * (1 - r.cp)) };
  };
  const pipeOverdue = (fy: FinancialYear, months: YearMonth[]) => pipeRows(fy).filter((r) => r.start <= dataThrough && months.includes(r.start));

  const trendPeriods = (mode: 'm' | 'q' | 'y', needOH: boolean): TrendPeriod[] => {
    if (mode === 'm') {
      let ms = [...new Set(P.map((p) => p.ym))].filter((m) => m <= dataThrough).sort();
      if (needOH) ms = ms.filter((m) => Boolean(ohMap[m]));
      return ms.slice(-12).map((m) => ({ label: mLabel(m), months: [m], partial: false }));
    }
    if (mode === 'q') {
      const out: TrendPeriod[] = [];
      for (const fy of FYS) {
        for (const q of [1, 2, 3, 4]) {
          const rep = reported(qMonths(fy, q));
          if (!rep.length) continue;
          if (needOH && !rep.every((m) => Boolean(ohMap[m]))) continue;
          out.push({ label: `Q${q} ${fyLabel(fy)}`, months: rep, partial: rep.length < 3 });
        }
      }
      return out.slice(-8);
    }
    const out: TrendPeriod[] = [];
    for (const fy of FYS) {
      const rep = reported(fyMonths(fy));
      if (!rep.length) continue;
      if (needOH && !rep.every((m) => Boolean(ohMap[m]))) continue;
      out.push({ label: fyLabel(fy), months: rep, partial: rep.length < 12 });
    }
    return out.slice(-5);
  };

  const execKpiData = (fy: FinancialYear, months: YearMonth[]): ExecKpiData => {
    const rep = reported(months);
    const a = agg(inMonths(rep));
    const pa = agg(inMonths(prevMonths(rep)));
    const oh = ohFor(rep);
    const ohOK = oh.covered && rep.length > 0;
    const eb = ohOK ? a.gp - oh.total : null;
    const ebPct = ohOK && eb != null ? pct(eb, a.rev) : null;
    const ohPrev = ohFor(prevMonths(rep));
    const ebPrevPct = ohPrev.covered && rep.length > 0 ? pct(pa.gp - ohPrev.total, pa.rev) : null;
    const T = targetFor(fy);
    return {
      rep, a, pa, oh, ohOK, eb, ebPct, ebPrevPct, T,
      tRev: targetIn(fy, months, 'rev'),
      tGP: targetIn(fy, months, 'gp'),
      expRev: targetIn(fy, rep, 'rev'),
      expGP: targetIn(fy, rep, 'gp'),
      tEbPct: T ? pct(T.ebitda, T.rev) : null,
    };
  };

  return { P, PIPE, OH, TGT, ohMap, FYS, dataThrough, todayM, curFY, curQ, vColor, reported, inMonths, ohFor, targetFor, gpFloor, defaultFY, hasPrevFullYear, seasonShare, targetIn, pipeRows, pipeInMonths, pipeOverdue, trendPeriods, execKpiData };
}
