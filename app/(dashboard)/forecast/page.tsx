'use client';

/**
 * Forecast. Coverage of the selected scope: the revenue and gross profit
 * scorecards, coverage by month, the month table, the pipeline landing list
 * and the landing plan.
 */

import { useState } from 'react';
import { SCChart } from '@/components/sc-chart';
import { Empty, Fbar, Muted, PageHead } from '@/components/ui';
import { useDrills } from '@/lib/drawer';
import { C, PLABEL, agg, clamp, fmt, fmtP, fyLabel, mLabel, mLong, pct, periodMonths, sum } from '@/lib/model';
import { useView } from '@/lib/use-model';

export default function ForecastPage() {
  const { m, fy, period } = useView();
  const [minW, setMinW] = useState(0);
  const drills = useDrills(m, fy, period);
  const ms = periodMonths(fy, period);
  const rep = m.reported(ms);
  const scopeName = period === 'all' ? fyLabel(fy) : `${PLABEL[period].split(' ·')[0]} ${fyLabel(fy)}`;
  const d = m.execKpiData(fy, ms);
  const { a, T } = d;
  const tRev = d.tRev;
  const com = m.pipeInMonths(fy, ms, 'committed');
  const wtd = m.pipeInMonths(fy, ms, 'weighted');
  const projected = a.rev + com.w + wtd.w;
  const gap = tRev != null ? tRev - projected : null;
  const remaining = ms.filter((mo) => mo > m.dataThrough);
  const req = tRev != null && remaining.length ? Math.max(0, tRev - a.rev) / remaining.length : null;
  const cov = tRev ? pct(projected, tRev) : null;

  const per = ms.map((mo) => {
    const r = m.inMonths([mo]);
    const rv = mo <= m.dataThrough ? sum(r, (p) => p.revenue) : 0;
    return { m: mo, rev: rv, com: m.pipeInMonths(fy, [mo], 'committed').w, wtd: m.pipeInMonths(fy, [mo], 'weighted').w, t: m.targetIn(fy, [mo], 'rev'), reported: mo <= m.dataThrough };
  });

  const landing = m
    .pipeRows(fy)
    .filter((r) => r.p >= minW && r.start > m.dataThrough && ms.includes(r.start))
    .map((r) => ({ ...r, w: r.rev * r.p }))
    .sort((x, y) => y.w - x.w);

  const overdue = m.pipeOverdue(fy, ms);

  return (
    <>
      <Fbar m={m} fy={fy} period={period} />
      <PageHead eyebrow="Forward View" title={`${scopeName} Forecast`} desc="What we have already done, whether we are on track, and what the forecast says — for the period selected above." />
      {T && tRev ? (
        <div className={`banner ${(cov ?? 0) >= 95 ? 'good' : (cov ?? 0) >= 75 ? 'warn' : 'bad'}`}>
          <b>{(cov ?? 0) >= 95 ? `${scopeName} is covered.` : (cov ?? 0) >= 75 ? `${scopeName} is partly covered.` : `${scopeName} is exposed.`}</b> Reported {fmt(a.rev)} + committed {fmt(com.w)} + weighted pipeline{' '}
          {fmt(wtd.w)} = <b>{fmt(projected)}</b>, {fmtP(cov, 0)} of the {fmt(tRev)} target
          {gap != null && gap > 0 ? (
            <>
              {' '}
              — <b>{fmt(gap)}</b> still has no name against it
            </>
          ) : null}
          .{req != null ? (
            <>
              {' '}
              The {remaining.length} open months must average <b>{fmt(req)}</b>.
            </>
          ) : null}
        </div>
      ) : (
        <div className="banner warn">No target on record for {fyLabel(fy)} — showing placed pipeline only.</div>
      )}
      {overdue.length ? (
        <div className="banner warn">
          <b>
            {overdue.length} {overdue.length === 1 ? 'opportunity is' : 'opportunities are'} not counted here.
          </b>{' '}
          Their start month is on or before {mLabel(m.dataThrough)}, the last reported month, so they are either already in Projects or have slipped. Together they are worth{' '}
          {fmt(sum(overdue, (r) => r.rev))} gross. Move the start month in the pipeline sheet, or remove them once reported.{' '}
          <button type="button" className="linkbtn" onClick={drills.overdueDrill}>
            See the list
          </button>
        </div>
      ) : null}

      <div className="g2">
        <Scorecard
          title="Revenue"
          accent={C.slate}
          scope={scopeName}
          target={tRev}
          reported={a.rev}
          committed={com.w}
          weighted={wtd.w}
          onReported={() => drills.drillKind('rev')}
          onCommitted={() => drills.pipeDrill('committed')}
          onWeighted={() => drills.pipeDrill('weighted')}
        />
        <Scorecard
          title="Gross Profit"
          accent={C.sage}
          scope={scopeName}
          target={d.tGP}
          reported={a.gp}
          committed={com.gp}
          weighted={wtd.gp}
          onReported={() => drills.drillKind('gp')}
          onCommitted={() => drills.pipeDrill('committed')}
          onWeighted={() => drills.pipeDrill('weighted')}
        />
      </div>

      <div>
        <div className="card">
          <div className="card-t">Coverage by Month</div>
          <div className="card-s">Reported revenue, committed pipeline and weighted pipeline, against each month&apos;s share of the target.</div>
          <SCChart
            cfg={{
              labels: per.map((x) => mLabel(x.m) + (x.reported ? '' : ' ◦')),
              onClick: (i) => {
                const x = per[i];
                if (x?.reported) drills.monthDrill(x.m);
              },
              series: [
                { name: 'Reported', data: per.map((x) => x.rev), color: C.sageA, stack: 's' },
                { name: 'Committed', data: per.map((x) => x.com), color: C.goldA, stack: 's' },
                { name: 'Weighted pipeline', data: per.map((x) => x.wtd), color: C.slateA, stack: 's' },
                ...(T ? [{ name: 'Target', kind: 'line' as const, dash: true, data: per.map((x) => x.t), color: C.ink }] : []),
              ],
            }}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-t">Month by Month</div>
        <div className="card-s">Months after the data-through date are not yet reported — they show pipeline only, never a loss.</div>
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Status</th>
                <th className="num">Revenue</th>
                <th className="num">GP</th>
                <th className="num">GM %</th>
                <th className="num">Committed</th>
                <th className="num">Weighted</th>
                <th className="num">Projected</th>
                <th className="num">Target</th>
              </tr>
            </thead>
            <tbody>
              {per.map((x) => {
                const a2 = agg(m.inMonths([x.m]));
                return (
                  <tr key={x.m} className={x.reported ? 'click' : ''} onClick={x.reported ? () => drills.monthDrill(x.m) : undefined}>
                    <td>
                      <b>{mLong(x.m)}</b>
                    </td>
                    <td>{x.reported ? <span className="tag good">reported</span> : x.m <= m.todayM ? <span className="tag warn">not yet reported</span> : <span className="tag">future</span>}</td>
                    <td className="num">{x.reported ? fmt(a2.rev) : <Muted />}</td>
                    <td className="num">{x.reported ? fmt(a2.gp) : <Muted />}</td>
                    <td className="num">{x.reported ? fmtP(a2.gm) : <Muted />}</td>
                    <td className="num">{x.reported ? <Muted /> : fmt(x.com)}</td>
                    <td className="num">{x.reported ? <Muted /> : fmt(x.wtd)}</td>
                    <td className="num">
                      <b>{fmt(x.rev + x.com + x.wtd)}</b>
                    </td>
                    <td className="num">{x.t != null ? fmt(x.t) : '—'}</td>
                  </tr>
                );
              })}
              <tr className="tot">
                <td>{scopeName}</td>
                <td>
                  {rep.length} of {ms.length} reported
                </td>
                <td className="num">{fmt(a.rev)}</td>
                <td className="num">{fmt(a.gp)}</td>
                <td className="num">{fmtP(a.gm)}</td>
                <td className="num">{fmt(com.w)}</td>
                <td className="num">{fmt(wtd.w)}</td>
                <td className="num">{fmt(projected)}</td>
                <td className="num">{tRev != null ? fmt(tRev) : '—'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div>
            <div className="card-t">Pipeline Landing in This Scope</div>
            <div className="card-s">Open opportunities placed in the remaining months of {scopeName}, weighted by the probability of their stage. Won deals stay here until they are reported.</div>
          </div>
          <select className="fsel no-print" value={String(minW)} onChange={(e) => setMinW(parseFloat(e.target.value) || 0)}>
            <option value="0">All confidence</option>
            <option value="1">Won only · 100%</option>
            <option value=".75">75% and above</option>
            <option value=".5">50% and above</option>
            <option value=".25">25% and above</option>
          </select>
        </div>
        <div className="tscroll">
          {landing.length ? (
            <table>
              <thead>
                <tr>
                  <th>Opportunity</th>
                  <th>Vertical</th>
                  <th>Month</th>
                  <th>Stage</th>
                  <th className="num">Gross Value</th>
                  <th className="num">Weighted</th>
                  <th className="num">Est GP %</th>
                  <th className="num">Est GP (wtd)</th>
                </tr>
              </thead>
              <tbody>
                {landing.map((r, i) => (
                  <tr key={`${r.n}-${i}`}>
                    <td>
                      <b>{r.n}</b>
                    </td>
                    <td>{r.v}</td>
                    <td>{mLabel(r.start)}</td>
                    <td>
                      <span className={`pill ${r.p >= 1 ? 'g' : 'a'}`}>
                        {r.stage} · {Math.round(r.p * 100)}%
                      </span>
                    </td>
                    <td className="num">{fmt(r.rev)}</td>
                    <td className="num">
                      <b>{fmt(r.w)}</b>
                    </td>
                    <td className="num">{fmtP((1 - r.cp) * 100, 0)}</td>
                    <td className="num">{fmt(r.w * (1 - r.cp))}</td>
                  </tr>
                ))}
                <tr className="tot">
                  <td colSpan={4}>Total · {landing.length} opportunities</td>
                  <td className="num">{fmt(sum(landing, (r) => r.rev))}</td>
                  <td className="num">{fmt(sum(landing, (r) => r.w))}</td>
                  <td />
                  <td className="num">{fmt(sum(landing, (r) => r.w * (1 - r.cp)))}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>No pipeline at this confidence placed in the remaining months of {scopeName}.</Empty>
          )}
        </div>
      </div>

      <div>
        <div className="card">
          <div className="card-t">Landing Plan</div>
          <div className="card-s">{remaining.length ? `${remaining.length} open months · required = remaining target ÷ open months.` : 'Fully reported — nothing left to place.'}</div>
          <div className="tscroll">
            {remaining.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="num">Required</th>
                    <th className="num">Placed</th>
                    <th className="num">Open Gap</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {remaining.map((mo) => {
                    const c = m.pipeInMonths(fy, [mo], 'committed').w;
                    const w2 = m.pipeInMonths(fy, [mo], 'weighted').w;
                    const placed = c + w2;
                    const g = req != null ? req - placed : null;
                    return (
                      <tr key={mo}>
                        <td>
                          <b>{mLong(mo)}</b>
                        </td>
                        <td className="num">{req != null ? fmt(req) : '—'}</td>
                        <td className="num">
                          <b>{fmt(placed)}</b>
                        </td>
                        <td className="num">{g != null ? fmt(Math.max(0, g)) : '—'}</td>
                        <td>{g == null ? '' : g <= 0 ? <span className="pill g">covered</span> : placed > 0 ? <span className="pill a">partly</span> : <span className="pill r">open</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <Empty>{scopeName} is fully reported.</Empty>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** One side of the scorecard pair: target, what is in hand, and the gap. */
function Scorecard(props: {
  title: string;
  accent: string;
  scope: string;
  target: number | null;
  reported: number;
  committed: number;
  weighted: number;
  onReported: () => void;
  onCommitted: () => void;
  onWeighted: () => void;
}) {
  const { title, accent, target, reported, committed, weighted } = props;
  const gap = target != null ? Math.max(0, target - reported - committed - weighted) : null;
  const cov = target ? pct(reported + committed + weighted, target) : null;
  const rows: Array<[string, number | null, (() => void) | undefined]> = [
    [`${title} Target`, target, undefined],
    [`${title} Reported`, reported, props.onReported],
    ['Committed Pipeline', committed, props.onCommitted],
    ['Weighted Pipeline', weighted, props.onWeighted],
  ];
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="card-t" style={{ color: accent }}>
        {title}
      </div>
      <div className="card-s">{target != null ? `Target, in hand and the gap — ${props.scope}.` : 'No target on record.'}</div>
      <table>
        <tbody>
          {rows.map(([k, v, click]) => (
            <tr key={k} className={click ? 'click' : ''} onClick={click}>
              <td>{k}</td>
              <td className="num">
                <b>{fmt(v)}</b>
              </td>
            </tr>
          ))}
          <tr className="tot">
            <td>Gap to target</td>
            <td className="num">{fmt(gap)}</td>
          </tr>
        </tbody>
      </table>
      <div className="meter" style={{ marginTop: 16, height: 12 }}>
        {cov != null ? (
          <>
            <div className={`fill ${cov >= 95 ? 'good' : cov >= 75 ? 'warn' : 'bad'}`} style={{ width: `${clamp(cov, 0, 100)}%` }} />
            <div className="mark" style={{ left: '100%' }} />
          </>
        ) : null}
      </div>
      <div className="meter-cap">
        <span>0</span>
        <span>{cov != null ? `${cov.toFixed(0)}% covered` : ''}</span>
      </div>
    </div>
  );
}
