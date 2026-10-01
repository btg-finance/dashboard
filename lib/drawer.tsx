'use client';

/**
 * The details drawer's state and the drills that open it: month, client,
 * vertical, industry, year, project, period, a P&L line, and the committed
 * or weighted pipeline.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ChartCfg } from '@/components/sc-chart';
import { C, PLABEL, agg, fmt, fmtP, fyLabel, fyMonths, mLabel, mLong, kindOf, pct, periodMonths, sum, type Model, type TrendPeriod } from './model';
import type { FinancialYear, Period, PipeKind, PipeRow, Project, YearMonth } from './types';

export interface DrawerKpi {
  v: string;
  l: string;
  c?: string;
}

export interface DrawerCfg {
  eyebrow: string;
  title: string;
  sub?: string;
  rows: Project[];
  kpis?: DrawerKpi[];
  chart?: ChartCfg;
  /** A custom table instead of the project list. */
  html?: React.ReactNode;
  /** Rows for "Download this slice" when `html` is used and `rows` is empty. */
  slice?: Array<Array<string | number>>;
  sliceHeads?: string[];
}

interface DrawerState {
  cfg: DrawerCfg | null;
  canBack: boolean;
  wide: boolean;
  open: (cfg: DrawerCfg, push?: boolean) => void;
  back: () => void;
  close: () => void;
  toggleWide: () => void;
}

const DrawerContext = createContext<DrawerState | null>(null);

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  // The open drill and the ones behind it live in one state, so going back is a single pure update.
  const [trail, setTrail] = useState<DrawerCfg[]>([]);
  const [wide, setWide] = useState(false);
  const cfg = trail[trail.length - 1] ?? null;

  const open = useCallback((next: DrawerCfg, push = true) => setTrail((t) => (push ? [...t, next] : [...t.slice(0, -1), next])), []);
  const back = useCallback(() => setTrail((t) => (t.length > 1 ? t.slice(0, -1) : t)), []);
  const close = useCallback(() => setTrail([]), []);
  const toggleWide = useCallback(() => setWide((w) => !w), []);

  const value = useMemo<DrawerState>(() => ({ cfg, canBack: trail.length > 1, wide, open, back, close, toggleWide }), [cfg, trail.length, wide, open, back, close, toggleWide]);
  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerState {
  const context = useContext(DrawerContext);
  if (!context) throw new Error('useDrawer must be used inside DrawerProvider');
  return context;
}

/** The drills, bound to the model and the active selection. */
export function useDrills(m: Model, fy: FinancialYear, period: Period) {
  const { open } = useDrawer();
  const perLbl = `${fyLabel(fy)} · ${PLABEL[period]}`;

  return useMemo(() => {
    const monthDrill = (mo: YearMonth) => {
      const ps = m.inMonths([mo]);
      const o = m.ohMap[mo];
      const a = agg(ps);
      open({
        eyebrow: 'Month Detail',
        title: mLong(mo),
        sub: `${a.n} projects${o ? ` · overheads ${fmt(o.total)}` : ' · no overhead record'}`,
        rows: ps,
        kpis: [
          { v: fmt(a.rev), l: 'Revenue' },
          { v: fmt(a.gp), l: 'Gross Profit' },
          { v: fmtP(a.gm), l: 'GM %' },
          { v: o ? fmt(o.total) : '—', l: 'Overheads' },
          { v: o ? fmt(a.gp - o.total) : '—', l: 'EBITDA', c: o && a.gp - o.total < 0 ? 'var(--rust)' : 'var(--sage)' },
        ],
      });
    };
    const clientDrill = (name: string) => {
      const ps = m.P.filter((p) => p.client === name);
      open({
        eyebrow: 'Client',
        title: name,
        sub: 'All years on record',
        rows: ps,
        chart: { labels: m.FYS.map(fyLabel), hideLegend: true, series: [{ name: 'Revenue', data: m.FYS.map((y) => sum(ps.filter((p) => p.ym && fyMonths(y).includes(p.ym)), (p) => p.revenue)), color: C.goldA }] },
      });
    };
    const inPeriod = () => m.inMonths(m.reported(periodMonths(fy, period)));
    const catDrill = (cat: string) => open({ eyebrow: `Vertical · ${perLbl}`, title: cat, sub: '', rows: inPeriod().filter((p) => p.scat === cat) });
    const indDrill = (ind: string) => open({ eyebrow: `Industry · ${perLbl}`, title: ind, sub: '', rows: inPeriod().filter((p) => p.industry === ind) });
    const fyDrill = (y: FinancialYear) => {
      const rep = m.reported(fyMonths(y));
      open({ eyebrow: 'Financial Year', title: fyLabel(y), sub: `Apr ${y - 1} – Mar ${y}${rep.length < 12 ? ` · partial, through ${mLabel(m.dataThrough)}` : ''}`, rows: m.inMonths(rep) });
    };
    const projDrill = (id: number) => {
      const p = m.P.find((x) => x.id === id);
      if (!p) return;
      const g = p.revenue > 0 ? (p.grossProfit / p.revenue) * 100 : 0;
      open({
        eyebrow: 'Project',
        title: p.name,
        sub: `${p.client || ''} · ${mLabel(p.ym)}`,
        rows: [p],
        kpis: [
          { v: fmt(p.revenue), l: 'Revenue' },
          { v: fmt(p.cost), l: 'Cost' },
          { v: fmt(p.grossProfit), l: 'Gross Profit', c: p.grossProfit >= 0 ? 'var(--sage)' : 'var(--rust)' },
          { v: `${g.toFixed(1)}%`, l: 'GP Margin' },
        ],
        html: (
          <table>
            <tbody>
              {(
                [
                  ['Client', <b key="c">{p.client}</b>],
                  ['Industry', p.industry],
                  ['Vertical', p.scat],
                  ['Market', p.de],
                  ['Model', p.recurring ? 'Retainer' : 'One-off'],
                  ['Month', mLong(p.ym)],
                ] as Array<[string, React.ReactNode]>
              ).map(([k, v]) => (
                <tr key={k}>
                  <td>{k}</td>
                  <td className="num">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ),
      });
    };
    const periodDrill = (per: TrendPeriod) => {
      const ps = m.inMonths(per.months);
      open({ eyebrow: 'Period Detail', title: per.label, sub: `${per.partial ? 'partial · ' : ''}through ${mLabel(m.dataThrough)}`, rows: ps.slice().sort((a, b) => b.revenue - a.revenue) });
    };
    const drillKind = (kind: 'rev' | 'gp' | 'cost' | 'ebitda' | 'oh') => {
      const months = m.reported(periodMonths(fy, period));
      const ps = m.inMonths(months);
      const a = agg(ps);
      if (kind === 'oh') {
        const os = months.map((mo) => m.ohMap[mo]).filter((o): o is NonNullable<typeof o> => Boolean(o));
        open({
          eyebrow: `Overheads · ${perLbl}`,
          title: 'Overheads',
          sub: `${os.length} months recorded`,
          kpis: [
            { v: fmt(sum(os, (o) => o.total)), l: 'Total' },
            { v: fmt(sum(os, (o) => o.sal)), l: 'Salaries' },
            { v: fmt(sum(os, (o) => o.opex)), l: 'Opex' },
          ],
          rows: [],
          slice: os.map((o) => [o.m, o.sal, o.opex, o.total]),
          sliceHeads: ['Month', 'Salaries', 'Opex', 'Total'],
          html: os.length ? (
            <table>
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="num">Total</th>
                  <th className="num">Salaries</th>
                  <th className="num">Opex</th>
                  <th className="num">vs Revenue</th>
                </tr>
              </thead>
              <tbody>
                {os.map((o) => {
                  const rv = sum(m.inMonths([o.m]), (p) => p.revenue);
                  return (
                    <tr key={o.m}>
                      <td>{mLong(o.m)}</td>
                      <td className="num">
                        <b>{fmt(o.total)}</b>
                      </td>
                      <td className="num">{fmt(o.sal)}</td>
                      <td className="num">{fmt(o.opex)}</td>
                      <td className="num">{fmtP(pct(o.total, rv))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="empty">
              <i>◦</i>
              <p>No overhead records in this period.</p>
            </div>
          ),
        });
        return;
      }
      const titles = { rev: 'Revenue', gp: 'Gross Profit', cost: 'Direct Cost', ebitda: 'EBITDA' };
      open({ eyebrow: `${titles[kind]} · ${perLbl}`, title: titles[kind], sub: `${a.n} projects behind this number`, rows: ps.slice().sort((x, y) => y.revenue - x.revenue) });
    };
    const pipeTable = (rows: PipeRow[]) =>
      rows.length ? (
        <table>
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Stage</th>
              <th className="num">Gross</th>
              <th className="num">Weighted</th>
              <th className="num">GP %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.n}-${i}`}>
                <td>
                  <b>{r.n}</b>
                  <br />
                  <span style={{ color: 'var(--ink4)', fontSize: '.64rem' }}>
                    {r.v} · {mLabel(r.start)}
                  </span>
                </td>
                <td>
                  <span className={`pill ${r.p >= 1 ? 'g' : 'a'}`}>{r.stage}</span>
                </td>
                <td className="num">{fmt(r.rev)}</td>
                <td className="num">{fmt(r.rev * r.p)}</td>
                <td className="num">{fmtP((1 - r.cp) * 100, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty">
          <i>◦</i>
          <p>Nothing recorded.</p>
        </div>
      );
    const pipeSlice = (rows: PipeRow[]) => rows.map((r) => [r.n, r.v, mLabel(r.start), r.stage, r.rev, r.rev * r.p]);
    const PIPE_HEADS = ['Opportunity', 'Vertical', 'Month', 'Stage', 'Gross', 'Weighted'];
    const pipeKpis = (rows: PipeRow[]) => [
      { v: String(rows.length), l: 'Opportunities' },
      { v: fmt(sum(rows, (r) => r.rev)), l: 'Gross Value' },
      { v: fmt(sum(rows, (r) => r.rev * r.p)), l: 'Weighted' },
    ];
    const overdueDrill = () => {
      const rows = m.pipeOverdue(fy, periodMonths(fy, period));
      open({
        eyebrow: `Forward View · ${perLbl}`,
        title: 'Not Counted',
        sub: `Start month is on or before ${mLabel(m.dataThrough)}, the last reported month`,
        rows: [],
        kpis: pipeKpis(rows),
        slice: pipeSlice(rows),
        sliceHeads: PIPE_HEADS,
        html: pipeTable(rows),
      });
    };
    const pipeDrill = (kind?: PipeKind) => {
      const rows = m.pipeRows(fy).filter((r) => (!kind || kindOf(r) === kind) && r.start > m.dataThrough);
      open({
        eyebrow: `Forward View · ${fyLabel(fy)}`,
        title: kind === 'weighted' ? 'Weighted Pipeline' : 'Committed Pipeline',
        sub: 'Weighted by stage probability · placed in the start month',
        rows: [],
        kpis: pipeKpis(rows),
        slice: pipeSlice(rows),
        sliceHeads: PIPE_HEADS,
        html: pipeTable(rows),
      });
    };
    return { monthDrill, clientDrill, catDrill, indDrill, fyDrill, projDrill, periodDrill, drillKind, pipeDrill, overdueDrill };
  }, [m, fy, period, open, perLbl]);
}
