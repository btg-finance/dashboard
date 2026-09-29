'use client';

/**
 * Profit & Loss: the period's KPIs, the quarter-expandable statement with
 * QoQ growth, the money bridge, overhead composition and the margin trend.
 */

import { useEffect, useState } from 'react';
import { ChartEmpty, SCChart } from '@/components/sc-chart';
import { Fbar, Kpi, Muted, PageHead, WfRow } from '@/components/ui';
import { useDrills } from '@/lib/drawer';
import { C, PLABEL, agg, fmt, fmtP, fyLabel, fyMonths, fyOf, mLabel, mLong, pcls, pct, periodMonths, qMonths, qOf, sum, type Model } from '@/lib/model';
import type { Period } from '@/lib/types';
import { useView } from '@/lib/use-model';

export default function PlPage() {
  const { m, fy, period } = useView();
  const drills = useDrills(m, fy, period);
  const [expanded, setExpanded] = useState<{ fy: number; qs: number[] } | null>(null);

  // The current quarter starts expanded, and the set resets when the year changes.
  useEffect(() => {
    if (expanded && expanded.fy === fy) return;
    const dq = fyOf(m.dataThrough) === fy ? qOf(m.dataThrough) : m.reported(fyMonths(fy)).length ? 4 : null;
    setExpanded({ fy, qs: dq ? [dq] : [] });
  }, [expanded, fy, m]);

  const open = new Set(expanded?.fy === fy ? expanded.qs : []);
  const toggle = (q: number) => setExpanded({ fy, qs: open.has(q) ? [...open].filter((x) => x !== q) : [...open, q] });

  const months = periodMonths(fy, period);
  const rep = m.reported(months);
  const rows = rep.map((mo) => {
    const a = agg(m.inMonths([mo]));
    const o = m.ohMap[mo];
    return { m: mo, ...a, oh: o?.total ?? 0, sal: o?.sal ?? 0, opex: o?.opex ?? 0, hasOH: Boolean(o) };
  });
  const T = { rev: sum(rows, (r) => r.rev), cost: sum(rows, (r) => r.cost), gp: sum(rows, (r) => r.gp), oh: sum(rows, (r) => r.oh) };
  const ohMonths = rows.filter((r) => r.hasOH).length;

  const qrows = [1, 2, 3, 4].map((q) => {
    const qm = qMonths(fy, q);
    const qr = m.reported(qm);
    const a2 = agg(m.inMonths(qr));
    const o = m.ohFor(qr);
    return { q, qm, qr, ...a2, oh: o.total, ohOK: o.n === qr.length && qr.length > 0, started: qr.length > 0, full: qr.length === 3 };
  });
  const fyRep = m.reported(fyMonths(fy));
  const fyA = agg(m.inMonths(fyRep));
  const fyOH = m.ohFor(fyRep);
  const fyEb = fyOH.covered && fyOH.n ? fyA.gp - fyOH.total : null;
  const ohRows = rows.filter((r) => r.hasOH);

  const cells = (r: (typeof qrows)[number]) => {
    const eb = r.ohOK ? r.gp - r.oh : null;
    return (
      <>
        <td className="num">{r.started ? fmt(-r.cost) : <Muted />}</td>
        <td className="num">{r.started ? <b>{fmt(r.gp)}</b> : <Muted />}</td>
        <td className="num">{r.started ? fmtP(r.gm) : <Muted />}</td>
        <td className="num">{r.ohOK ? fmt(r.oh) : <Muted />}</td>
        <td className={`num ${eb != null && eb < 0 ? 'dn' : ''}`}>{eb != null ? <b>{fmt(eb)}</b> : <Muted />}</td>
        <td className="num">{eb != null ? fmtP(pct(eb, r.rev)) : <Muted />}</td>
      </>
    );
  };

  return (
    <>
      <Fbar m={m} fy={fy} period={period} />
      <PageHead eyebrow="Statement" title="Profit &amp; Loss" desc="How revenue becomes profit, month by month. Direct cost is project cost only; overheads are salaries plus operating expenses. The statement stops at EBITDA." />
      <div className="kpis">
        <Kpi label="Revenue" value={fmt(T.rev)} sub={`${rep.length} reported months`} accent={C.slate} onClick={() => drills.drillKind('rev')} />
        <Kpi label="Direct Cost" value={fmt(T.cost)} sub={`${fmtP(pct(T.cost, T.rev), 1)} of revenue`} accent={C.rust} onClick={() => drills.drillKind('cost')} />
        <Kpi label="Gross Profit" value={fmt(T.gp)} sub={`${fmtP(pct(T.gp, T.rev), 1)} margin`} accent={C.sage} onClick={() => drills.drillKind('gp')} />
        <Kpi label="Overheads" value={fmt(T.oh)} sub={ohMonths ? `${ohMonths} months recorded` : 'no records this period'} accent={C.gold} onClick={() => drills.drillKind('oh')} />
        <Kpi label="EBITDA" value={fmt(T.gp - T.oh)} sub={ohMonths ? `${fmtP(pct(T.gp - T.oh, T.rev), 1)} margin` : 'equals GP — no OH data'} accent={T.gp - T.oh >= 0 ? C.sage : C.rust} onClick={() => drills.drillKind('ebitda')} />
      </div>

      <div className="card">
        <div className="card-t">Statement — {fyLabel(fy)}</div>
        <div className="card-s">
          Full {fyLabel(fy)}, quarter by quarter — click a quarter to expand its months; the current quarter starts expanded.{' '}
          {ohMonths < rep.length ? 'Overhead records do not cover every reported month — EBITDA is overstated where they are missing.' : 'Depreciation, interest and tax are not tracked here.'}
        </div>
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th>Period</th>
                <th className="num">Revenue</th>
                <th className="num">QoQ %</th>
                <th className="num">Direct Cost</th>
                <th className="num">Gross Profit</th>
                <th className="num">GM %</th>
                <th className="num">Overheads</th>
                <th className="num">EBITDA</th>
                <th className="num">EBITDA %</th>
              </tr>
            </thead>
            <tbody>
              {qrows.map((r, i) => {
                const prev = qrows[i - 1];
                const qoq = prev && prev.started && r.started && prev.rev > 0 ? ((r.rev - prev.rev) / prev.rev) * 100 : null;
                const isOpen = open.has(r.q);
                return (
                  <QuarterRows key={r.q} r={r} isOpen={isOpen} toggle={() => toggle(r.q)} qoq={qoq} soft={Boolean(prev && (!r.full || !prev.full))} m={m} cells={cells(r)} onMonth={drills.monthDrill} />
                );
              })}
              <tr className="tot">
                <td>
                  {fyLabel(fy)} · {fyRep.length} of 12 reported
                </td>
                <td className="num">{fmt(fyA.rev)}</td>
                <td className="num" />
                <td className="num">{fmt(-fyA.cost)}</td>
                <td className="num">{fmt(fyA.gp)}</td>
                <td className="num">{fmtP(fyA.gm)}</td>
                <td className="num">{fyOH.n ? fmt(fyOH.total) : '—'}</td>
                <td className="num">{fyEb != null ? fmt(fyEb) : '—'}</td>
                <td className="num">{fyEb != null ? fmtP(pct(fyEb, fyA.rev)) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-t">Where the Money Went</div>
        <div className="card-s">Every rupee of revenue, traced through delivery cost and overhead to profit.</div>
        <div className="wf">
          {rep.length ? (
            <>
              <WfRow label="Revenue" val={T.rev} max={T.rev} color={C.slate} />
              <WfRow label="− Direct cost" val={T.cost} max={T.rev} color={C.rust} />
              <WfRow label="= Gross profit" val={T.gp} max={T.rev} color={C.sage} />
              <WfRow label="− Overheads" val={T.oh} max={T.rev} color={C.gold} />
              <WfRow label="= EBITDA" val={T.gp - T.oh} max={T.rev} color={T.gp - T.oh >= 0 ? C.ink : C.rust} />
            </>
          ) : null}
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-t">Overhead Composition</div>
          <div className="card-s">Salaries and operating expenses, by month.</div>
          {ohRows.length ? (
            <SCChart
              cfg={{
                labels: ohRows.map((r) => mLabel(r.m)),
                series: [
                  { name: 'Salaries', data: ohRows.map((r) => r.sal), color: C.slateA, stack: 'o' },
                  { name: 'Operating expenses', data: ohRows.map((r) => r.opex), color: C.goldA, stack: 'o' },
                ],
              }}
            />
          ) : (
            <div className="cwrap"><ChartEmpty msg={`No overhead records for this period — records run ${m.OH.length ? `${mLabel(m.OH[0]!.m)} to ${mLabel(m.OH[m.OH.length - 1]!.m)}` : '—'}.`} /></div>
          )}
        </div>
        <div className="card">
          <div className="card-t">Margin Trend</div>
          <div className="card-s">Gross margin and EBITDA margin, month by month.</div>
          {rep.length ? (
            <SCChart
              cfg={{
                labels: rows.map((r) => mLabel(r.m)),
                pctAxis: true,
                series: [
                  { name: 'GM %', kind: 'line', pct: true, data: rows.map((r) => (r.rev > 0 ? +((r.gp / r.rev) * 100).toFixed(1) : null)), color: C.sage },
                  { name: 'EBITDA %', kind: 'line', pct: true, dash: true, data: rows.map((r) => (r.rev > 0 && r.hasOH ? +(((r.gp - r.oh) / r.rev) * 100).toFixed(1) : null)), color: C.gold },
                ],
              }}
            />
          ) : (
            <div className="cwrap"><ChartEmpty msg="No data." /></div>
          )}
        </div>
      </div>
    </>
  );
}

function QuarterRows({ r, isOpen, toggle, qoq, soft, m, cells, onMonth }: { r: { q: number; qm: string[]; qr: string[]; rev: number; started: boolean; full: boolean }; isOpen: boolean; toggle: () => void; qoq: number | null; soft: boolean; m: Model; cells: React.ReactNode; onMonth: (mo: string) => void }) {
  return (
    <>
      <tr className="click" onClick={toggle}>
        <td>
          <span className={`chev ${isOpen ? 'open' : ''}`}>▶</span>
          <b>
            Q{r.q} · {PLABEL[`q${r.q}` as Period].split('· ')[1]}
          </b>
          {!r.started ? <span className="tag"> not started</span> : !r.full ? <span className="tag warn"> {r.qr.length} of 3</span> : null}
        </td>
        <td className="num">{r.started ? fmt(r.rev) : <Muted />}</td>
        <td className="num">
          {qoq == null ? (
            <Muted />
          ) : (
            <>
              <span className={pcls(qoq)}>
                <b>
                  {qoq >= 0 ? '+' : ''}
                  {qoq.toFixed(0)}%
                </b>
              </span>
              {soft ? <Muted> ◦</Muted> : null}
            </>
          )}
        </td>
        {cells}
      </tr>
      {isOpen
        ? r.qm.map((mo) => {
            if (mo > m.dataThrough) {
              return (
                <tr className="mrow" key={mo}>
                  <td>{mLong(mo)}</td>
                  <td className="num" colSpan={8}>
                    <Muted>not yet reported</Muted>
                  </td>
                </tr>
              );
            }
            const ma = agg(m.inMonths([mo]));
            const o = m.ohMap[mo];
            const eb = o ? ma.gp - o.total : null;
            return (
              <tr
                className="mrow click"
                key={mo}
                onClick={(e) => {
                  e.stopPropagation();
                  onMonth(mo);
                }}
              >
                <td>{mLong(mo)}</td>
                <td className="num">{fmt(ma.rev)}</td>
                <td className="num" />
                <td className="num">{fmt(-ma.cost)}</td>
                <td className="num">{fmt(ma.gp)}</td>
                <td className="num">{fmtP(ma.gm)}</td>
                <td className="num">{o ? fmt(o.total) : <Muted />}</td>
                <td className={`num ${eb != null && eb < 0 ? 'dn' : ''}`}>{eb != null ? fmt(eb) : <Muted />}</td>
                <td className="num">{eb != null ? fmtP(pct(eb, ma.rev)) : '—'}</td>
              </tr>
            );
          })
        : null}
    </>
  );
}
