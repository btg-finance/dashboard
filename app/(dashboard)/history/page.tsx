'use client';

/**
 * Historical Performance: the long view across financial years, quarter
 * seasonality, the year-on-year card, and a searchable, sortable client
 * history.
 */

import { useState } from 'react';
import { SCChart } from '@/components/sc-chart';
import { Empty, Fbar, GpPill, Kpi, Muted, PageHead } from '@/components/ui';
import { useDrills } from '@/lib/drawer';
import { C, PLABEL, agg, fmt, fmtP, fyLabel, fyMonths, fyOf, groupBy, pcls, pct, periodMonths, prevMonths, qMonths, sum } from '@/lib/model';
import { useView } from '@/lib/use-model';

export default function HistoryPage() {
  const { m, fy, period } = useView();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: 'total', dir: -1 });
  const drills = useDrills(m, fy, period);
  const yr = m.FYS.map((y) => {
    const rep = m.reported(fyMonths(y));
    const a = agg(m.inMonths(rep));
    const o = m.ohFor(rep);
    return { fy: y, ...a, oh: o.total, ohOK: o.covered && o.n > 0, ebitda: a.gp - o.total, partial: rep.length < 12, repN: rep.length };
  });
  const full = yr.filter((y) => !y.partial);
  const cagr = full.length >= 2 ? (Math.pow(full[full.length - 1]!.rev / full[0]!.rev, 1 / (full.length - 1)) - 1) * 100 : null;
  const allA = agg(m.P);
  const seen = new Set<string>();
  let repeatRev = 0;
  for (const y of m.FYS) {
    const rows = m.inMonths(m.reported(fyMonths(y)));
    for (const p of rows) if (seen.has(p.client)) repeatRev += p.revenue;
    for (const p of rows) seen.add(p.client);
  }
  const tg = m.gpFloor(fy);

  const growth = (y: (typeof yr)[number], i: number) => {
    const prev = yr[i - 1];
    if (!prev || !prev.rev) return <Muted />;
    const g = ((y.rev - prev.rev) / prev.rev) * 100;
    return (
      <>
        <span className={pcls(g)}>
          <b>
            {g >= 0 ? '+' : ''}
            {g.toFixed(0)}%
          </b>
        </span>
        {y.partial || prev.partial ? <Muted> ◦</Muted> : null}
      </>
    );
  };
  const hline = (lbl: string, f: (y: (typeof yr)[number], i: number) => React.ReactNode, o: { tot?: boolean; b?: boolean } = {}) => (
    <tr className={o.tot ? 'tot' : ''} key={lbl}>
      <td>{o.b ? <b>{lbl}</b> : lbl}</td>
      {yr.map((y, i) => (
        <td className="num" key={y.fy}>
          {f(y, i)}
        </td>
      ))}
    </tr>
  );

  const allCats = [...new Set(m.P.map((p) => p.scat))];
  const rep = m.reported(periodMonths(fy, period));
  const cur = agg(m.inMonths(rep));
  const pre = agg(m.inMonths(prevMonths(rep)));
  const dRow = (lbl: string, a: number, b: number, f: (v: number) => string = fmt) => {
    const d = b > 0 ? ((a - b) / b) * 100 : null;
    return (
      <tr key={lbl}>
        <td>{lbl}</td>
        <td className="num">{f(a)}</td>
        <td className="num">{f(b)}</td>
        <td className="num">{d == null ? '—' : Math.abs(d) > 999 ? <span className="pill s">n/m</span> : <span className={`pill ${d >= 0 ? 'g' : 'r'}`}>{`${d >= 0 ? '+' : ''}${d.toFixed(0)}%`}</span>}</td>
      </tr>
    );
  };

  /* client history */
  const ql = q.trim().toLowerCase();
  let list = Object.entries(groupBy(m.P, (p) => p.client)).map(([k, v]) => {
    const byFY: Record<number, number> = {};
    for (const y of m.FYS) byFY[y] = sum(v.filter((p) => fyOf(p.ym) === y), (p) => p.revenue);
    const rev = sum(v, (p) => p.revenue);
    const gp = sum(v, (p) => p.grossProfit);
    return { name: k, byFY, total: rev, gp, gmv: rev > 0 ? (gp / rev) * 100 : 0 };
  });
  if (ql) list = list.filter((c) => c.name.toLowerCase().includes(ql));
  const key = (c: (typeof list)[number]) => (sort.col === 'total' ? c.total : sort.col === 'gp' ? c.gmv : (c.byFY[Number(sort.col)] ?? 0));
  list.sort((a, b) => (key(a) - key(b)) * sort.dir || b.total - a.total);
  const sortBy = (col: string) => setSort((s) => (s.col === col ? { col, dir: s.dir === 1 ? -1 : 1 } : { col, dir: -1 }));
  const arr = (col: string) => (sort.col === col ? <span className="arr">{sort.dir < 0 ? '▼' : '▲'}</span> : null);

  return (
    <>
      <Fbar m={m} fy={fy} period={period} />
      <PageHead eyebrow="Long View" title="Historical Performance" desc="How each financial year stacks up — growth, margin discipline and the shape of the book over time. The comparison always shows every year; the period filter drives the year-on-year card." />
      <div className="kpis">
        <Kpi label="Lifetime Clients" value={allA.clients} sub={m.FYS.map(fyLabel).join(' · ')} accent={C.slate} />
        <Kpi label="Revenue CAGR" value={cagr != null ? `${cagr.toFixed(0)}%` : '—'} sub={full.length >= 2 ? `${fyLabel(full[0]!.fy)} → ${fyLabel(full[full.length - 1]!.fy)}, complete years` : 'needs two complete years'} accent={(cagr ?? 0) >= 0 ? C.sage : C.rust} />
        <Kpi label="Projects All-Time" value={allA.n} sub={`avg ${fmt(allA.avg)} per project`} accent={C.gold} />
        <Kpi label="Lifetime Gross Margin" value={fmtP(allA.gm)} sub={`${fmt(allA.gp)} gross profit`} accent={C.sage} />
        <Kpi label="Repeat Revenue" value={fmtP(pct(repeatRev, allA.rev), 0)} sub="from clients seen in an earlier year" accent={C.slate} />
      </div>

      <div className="card">
        <div className="card-t">Financial Year Comparison</div>
        <div className="tscroll">
          <table>
            <thead>
              <tr>
                <th>Line</th>
                {yr.map((y) => (
                  <th className="num" style={{ cursor: 'pointer' }} key={y.fy} onClick={() => drills.fyDrill(y.fy)}>
                    {fyLabel(y.fy)}
                    {y.partial ? <span className="tag warn"> {y.repN} mo</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hline('Revenue', (y) => <b>{fmt(y.rev)}</b>, { b: true })}
              {hline('YoY growth', growth)}
              {hline('Direct cost', (y) => fmt(-(y.rev - y.gp)))}
              {hline('Gross profit', (y) => <b>{fmt(y.gp)}</b>, { tot: true })}
              {hline('GM %', (y) => fmtP(y.gm))}
              {hline('Overheads', (y) => (y.ohOK ? fmt(-y.oh) : <Muted />))}
              {hline('EBITDA', (y) => (y.ohOK ? <b>{fmt(y.ebitda)}</b> : <Muted />), { tot: true })}
              {hline('EBITDA %', (y) => (y.ohOK ? fmtP(pct(y.ebitda, y.rev)) : <Muted />))}
              {hline('Projects', (y) => String(y.n))}
              {hline('Clients', (y) => String(y.clients))}
              {hline('Avg project value', (y) => fmt(y.avg))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="card-t">Revenue &amp; Margin by Year</div>
          <SCChart
            cfg={{
              labels: yr.map((y) => fyLabel(y.fy) + (y.partial ? ' ◦' : '')),
              onClick: (i) => yr[i] && drills.fyDrill(yr[i]!.fy),
              series: [
                { name: 'Revenue', data: yr.map((y) => y.rev), color: C.slateA },
                { name: 'Gross Profit', data: yr.map((y) => y.gp), color: C.sageA },
                { name: 'GM %', kind: 'line', y2: true, pct: true, data: yr.map((y) => (y.gm == null ? null : +y.gm.toFixed(1))), color: C.gold },
              ],
            }}
          />
        </div>
        <div className="card">
          <div className="card-t">Vertical Mix by Year</div>
          <SCChart
            cfg={{
              labels: yr.map((y) => fyLabel(y.fy) + (y.partial ? ' ◦' : '')),
              series: allCats.map((c) => ({ name: c, data: yr.map((y) => sum(m.inMonths(m.reported(fyMonths(y.fy))).filter((p) => p.scat === c), (p) => p.revenue)), color: m.vColor[c] ?? C.slate, stack: 'm' })),
            }}
          />
        </div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-t">Quarter on Quarter</div>
          <div className="card-s">Revenue by quarter across years — seasonality at a glance. Open quarters are partial.</div>
          <SCChart cfg={{ labels: ['Q1', 'Q2', 'Q3', 'Q4'], series: yr.map((y, i) => ({ name: fyLabel(y.fy), data: [1, 2, 3, 4].map((qq) => sum(m.inMonths(m.reported(qMonths(y.fy, qq))), (p) => p.revenue)), color: [C.slateA, C.sageA, C.goldA, C.rustA][i % 4]! })) }} />
        </div>
        <div className="card">
          <div className="card-t">Year on Year — Same Period</div>
          <div className="card-s">
            {PLABEL[period]}, reported months only — {fyLabel(fy)} vs {fyLabel(fy - 1)}.
          </div>
          <div className="tscroll">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th className="num">{fyLabel(fy)}</th>
                  <th className="num">{fyLabel(fy - 1)}</th>
                  <th className="num">Δ</th>
                </tr>
              </thead>
              <tbody>
                {dRow('Revenue', cur.rev, pre.rev)}
                {dRow('Gross profit', cur.gp, pre.gp)}
                <tr>
                  <td>GM %</td>
                  <td className="num">{fmtP(cur.gm)}</td>
                  <td className="num">{fmtP(pre.gm)}</td>
                  <td className="num" />
                </tr>
                {dRow('Projects', cur.n, pre.n, String)}
                {dRow('Clients', cur.clients, pre.clients, String)}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div>
            <div className="card-t">Client History</div>
            <div className="card-s">Revenue per client per year. Click a column header to sort, a row for detail.</div>
          </div>
          <input className="search no-print" placeholder="Search client…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="tscroll vscroll">
          <table>
            <thead>
              <tr>
                <th>
                  Client{ql ? <span className="tag"> {list.length} match</span> : null}
                </th>
                {m.FYS.map((y) => (
                  <th className="num sort" key={y} onClick={() => sortBy(String(y))}>
                    {fyLabel(y)} {arr(String(y))}
                  </th>
                ))}
                <th className="num sort" onClick={() => sortBy('total')}>
                  Total {arr('total')}
                </th>
                <th className="num sort" onClick={() => sortBy('gp')}>
                  GP % {arr('gp')}
                </th>
              </tr>
            </thead>
            <tbody>
              {list.length ? (
                list.map((c) => (
                  <tr className="click" key={c.name} onClick={() => drills.clientDrill(c.name)}>
                    <td>
                      <b>{c.name}</b>
                    </td>
                    {m.FYS.map((y) => (
                      <td className="num" key={y}>
                        {c.byFY[y] ? fmt(c.byFY[y]) : '·'}
                      </td>
                    ))}
                    <td className="num">
                      <b>{fmt(c.total)}</b>
                    </td>
                    <td className="num">
                      <GpPill gp={c.gp} rev={c.total} tg={tg} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={m.FYS.length + 3}>
                    <Empty icon={null}>No client matches &quot;{q}&quot;.</Empty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
