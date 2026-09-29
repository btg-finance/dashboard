'use client';

/**
 * Small building blocks shared by the pages: KPI tiles with their pace
 * meter, tables, the GP pill, waterfall rows, deltas, empty states, and the
 * shared period bar.
 */

import type { CSSProperties, ReactNode } from 'react';
import { toCsv, type CsvCell } from '@/lib/csv';
import { useFilters } from '@/lib/filters';
import { PLABEL, clamp, delta, fmt, fyLabel, periodMonths, type Model } from '@/lib/model';
import type { FinancialYear, Period } from '@/lib/types';

export function Delta({ cur, prev, pts }: { cur: number | null | undefined; prev: number | null | undefined; pts?: boolean }) {
  const d = delta(cur, prev, { pts });
  return <span className={`delta ${d.cls}`}>{d.text}</span>;
}

export function Meter({ fill, mark, cls, cap }: { fill: number | null; mark?: number | null; cls?: string; cap?: [string, string] | null }) {
  if (fill == null) return null;
  return (
    <>
      <div className="meter">
        <div className={`fill ${cls ?? ''}`} style={{ width: `${clamp(fill, 0, 100)}%` }} />
        {mark != null ? <div className="mark" style={{ left: `${clamp(mark, 0, 100)}%` }} /> : null}
      </div>
      {cap ? (
        <div className="meter-cap">
          <span>{cap[0]}</span>
          <span>{cap[1]}</span>
        </div>
      ) : null}
    </>
  );
}

export function paceCls(fill: number | null, mark: number | null): string {
  if (fill == null) return '';
  if (mark == null) return fill >= 100 ? 'good' : 'warn';
  return fill >= mark - 2 ? 'good' : fill >= mark * 0.72 ? 'warn' : 'bad';
}

export function Kpi({ label, value, sub, accent, onClick, meter }: { label: string; value: ReactNode; sub?: ReactNode; accent: string; onClick?: () => void; meter?: ReactNode }) {
  return (
    <div className={`kpi ${onClick ? '' : 'static'}`} style={{ '--accent': accent } as CSSProperties} onClick={onClick}>
      <div className="kpi-lbl">{label}</div>
      <div className="kpi-val">{value}</div>
      {meter}
      <div className="kpi-sub">{sub ?? ' '}</div>
    </div>
  );
}

/** A plain table: first column left, the rest numeric, optional row clicks. */
export function Tbl({ heads, rows, clicks, keys }: { heads: ReactNode[]; rows: ReactNode[][]; clicks?: Array<(() => void) | undefined>; keys?: Array<string | number> }) {
  return (
    <table>
      <thead>
        <tr>
          {heads.map((h, i) => (
            <th key={i} className={i > 0 ? 'num' : ''}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => {
          const click = clicks?.[ri];
          return (
            <tr key={keys?.[ri] ?? ri} className={click ? 'click' : ''} onClick={click}>
              {r.map((c, i) => (
                <td key={i} className={i > 0 ? 'num' : ''}>
                  {c}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The GP% pill, coloured against the year's target margin. */
export function GpPill({ gp, rev, tg }: { gp: number; rev: number; tg: number }) {
  if (!(rev > 0)) return <>—</>;
  const v = (gp / rev) * 100;
  const cls = v >= tg + 10 ? 'g' : v >= tg ? 'a' : 'r';
  return <span className={`pill ${cls}`}>{v.toFixed(1)}%</span>;
}

export function WfRow({ label, val, max, color }: { label: string; val: number; max: number; color: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (val / max) * 100)) : 0;
  return (
    <div className="wf-row">
      <span className="wf-lbl">{label}</span>
      <span className="wf-track">
        <span className="wf-fill" style={{ left: 0, width: `${w.toFixed(1)}%`, background: color }} />
      </span>
      <span className="wf-val">{fmt(val)}</span>
    </div>
  );
}

export function Empty({ icon = '◦', children, style }: { icon?: string | null; children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="empty" style={style}>
      {icon ? <i>{icon}</i> : null}
      <p>{children}</p>
    </div>
  );
}

export const Muted = ({ children = '—' }: { children?: ReactNode }) => <span className="muted">{children}</span>;

/** The shared period bar: year, then FY / Q1–Q4 / H1 / H2, and what is reported. */
export function Fbar({ m, fy, period }: { m: Model; fy: FinancialYear; period: Period }) {
  const { setFY, setPeriod } = useFilters();
  const rep = m.reported(periodMonths(fy, period));
  const segs: Array<[Period, string]> = [
    ['all', 'FY'],
    ['q1', 'Q1'],
    ['q2', 'Q2'],
    ['q3', 'Q3'],
    ['q4', 'Q4'],
    ['h1', 'H1'],
    ['h2', 'H2'],
  ];
  return (
    <div className="fbar">
      <span className="fbar-lbl">Period</span>
      <select className="fy-sel" value={fy} onChange={(e) => setFY(Number(e.target.value))}>
        {m.FYS.map((y) => (
          <option key={y} value={y}>
            {fyLabel(y)}
          </option>
        ))}
      </select>
      <div className="seg">
        {segs.map(([p, l]) => (
          <button key={p} type="button" className={p === period ? 'on' : ''} onClick={() => setPeriod(p)}>
            {l}
          </button>
        ))}
      </div>
      <span className="fbar-info">
        {fyLabel(fy)} · <b>{PLABEL[period]}</b> · {rep.length} of {periodMonths(fy, period).length} months reported
      </span>
    </div>
  );
}

export function PageHead({ eyebrow, title, desc }: { eyebrow: string; title: ReactNode; desc: ReactNode }) {
  return (
    <div className="phead">
      <div className="eyebrow">{eyebrow}</div>
      <div className="ptitle">{title}</div>
      <div className="pdesc">{desc}</div>
    </div>
  );
}

/** Rows as CSV, handed to the browser as a download. */
export function downloadCSV(rows: CsvCell[][], heads: string[], fname: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([toCsv(heads, rows)], { type: 'text/csv' }));
  a.download = fname;
  a.click();
  URL.revokeObjectURL(a.href);
}
