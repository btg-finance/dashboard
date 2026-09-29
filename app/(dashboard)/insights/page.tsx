'use client';

/**
 * Business Insights: verticals and industries, client concentration,
 * geography and model, pricing discipline, and the best and worst projects,
 * with three refine filters.
 */

import { useState } from 'react';
import { ChartEmpty, SCChart } from '@/components/sc-chart';
import { Empty, Fbar, GpPill, Kpi, PageHead, Tbl } from '@/components/ui';
import { useDrills } from '@/lib/drawer';
import { C, agg, fmt, fmtP, fyLabel, fyOf, groupBy, pct, periodMonths, sum } from '@/lib/model';
import type { Project } from '@/lib/types';
import { useView } from '@/lib/use-model';

const opts = (list: string[], label: string) => (
  <>
    <option value="">{label}</option>
    {list.map((x) => (
      <option key={x}>{x}</option>
    ))}
  </>
);

export default function InsightsPage() {
  const { m, fy, period } = useView();
  const [f, setF] = useState({ ind: '', cli: '', cat: '' });
  const drills = useDrills(m, fy, period);
  const rep = m.reported(periodMonths(fy, period));
  const ps = m.inMonths(rep).filter((p) => (!f.ind || p.industry === f.ind) && (!f.cli || p.client === f.cli) && (!f.cat || p.scat === f.cat));
  const t = agg(ps);
  const act = [f.ind, f.cli, f.cat].filter(Boolean);
  const prevClients = new Set(m.P.filter((p) => fyOf(p.ym) === fy - 1).map((p) => p.client));
  const repeatRev = sum(ps.filter((p) => prevClients.has(p.client)), (p) => p.revenue);
  const exportRev = sum(ps.filter((p) => p.de === 'Export'), (p) => p.revenue);
  const retRev = sum(ps.filter((p) => p.recurring), (p) => p.revenue);
  const cli = Object.entries(groupBy(ps, (p) => p.client))
    .map(([k, v]) => ({ name: k, ...agg(v) }))
    .sort((x, y) => y.rev - x.rev);
  const top1 = cli[0];
  const top5 = sum(cli.slice(0, 5), (c) => c.rev);
  const cats = Object.entries(groupBy(ps, (p) => p.scat))
    .map(([k, v]) => ({ name: k, ...agg(v) }))
    .sort((x, y) => y.rev - x.rev);
  const inds = Object.entries(groupBy(ps, (p) => p.industry))
    .map(([k, v]) => ({ name: k, ...agg(v) }))
    .sort((x, y) => y.rev - x.rev);
  const topN = cli.slice(0, 10);
  let cum = 0;
  const cumPct = topN.map((c) => {
    cum += c.rev;
    return t.rev > 0 ? +((cum / t.rev) * 100).toFixed(1) : 0;
  });
  const des = Object.entries(groupBy(ps, (p) => p.de))
    .map(([k, v]) => ({ name: k, ...agg(v) }))
    .sort((x, y) => y.rev - x.rev);
  const rts = (
    [
      ['Retainer', ps.filter((p) => p.recurring)],
      ['One-off', ps.filter((p) => !p.recurring)],
    ] as Array<[string, Project[]]>
  ).map(([k, v]) => ({ name: k, ...agg(v) }));

  const tg = m.gpFloor(fy);
  const core = ps.filter((p) => String(p.scat) !== 'Others' && p.revenue > 0);
  const under = core.filter((p) => (p.grossProfit / p.revenue) * 100 < tg).sort((x, y) => x.grossProfit / x.revenue - y.grossProfit / y.revenue);
  const uplift = sum(under, (p) => (p.revenue * tg) / 100 - p.grossProfit);
  const gps = core.map((p) => (p.grossProfit / p.revenue) * 100).sort((x, y) => x - y);
  const median = gps.length ? gps[Math.floor(gps.length / 2)]! : null;
  const benchCats = Object.entries(groupBy(core, (p) => p.scat))
    .map(([k, v]) => {
      const g = v.map((p) => (p.grossProfit / p.revenue) * 100).sort((x, y) => x - y);
      const rev = sum(v, (p) => p.revenue);
      return { name: k, n: v.length, rev, med: g[Math.floor(g.length / 2)]!, avg: pct(sum(v, (p) => p.grossProfit), rev) };
    })
    .sort((x, y) => y.rev - x.rev);
  const ranked = core.slice().sort((x, y) => y.grossProfit - x.grossProfit);
  const rankTbl = (arr: Project[]) => (
    <Tbl
      heads={['Project', 'Client', 'Revenue', 'GP', 'GP %']}
      rows={arr.map((p) => [p.name, p.client, fmt(p.revenue), fmt(p.grossProfit), <GpPill key="g" gp={p.grossProfit} rev={p.revenue} tg={tg} />])}
      clicks={arr.map((p) => () => drills.projDrill(p.id))}
      keys={arr.map((p) => p.id)}
    />
  );
  const kpi = (l: string, v: React.ReactNode, s: React.ReactNode, a: string) => <Kpi key={l} label={l} value={v} sub={s} accent={a} />;

  return (
    <>
      <Fbar m={m} fy={fy} period={period} />
      <PageHead eyebrow="Business Mix" title="Business Insights" desc="Where the money comes from, and where margin quietly leaks — verticals, industries, clients, geography and pricing." />
      <div className="fbar" style={{ marginBottom: 22 }}>
        <span className="fbar-lbl">Refine</span>
        <select className="fsel" value={f.ind} onChange={(e) => setF({ ...f, ind: e.target.value })}>
          {opts([...new Set(m.P.map((p) => p.industry))].sort(), 'All industries')}
        </select>
        <select className="fsel" value={f.cli} onChange={(e) => setF({ ...f, cli: e.target.value })}>
          {opts([...new Set(m.P.map((p) => p.client))].sort(), 'All clients')}
        </select>
        <select className="fsel" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })}>
          {opts([...new Set(m.P.map((p) => p.scat))].sort(), 'All service categories')}
        </select>
        <button type="button" className="linkbtn" onClick={() => setF({ ind: '', cli: '', cat: '' })}>
          Reset
        </button>
        <span className="fbar-info">
          {act.length ? (
            <>
              filtered: <b>{act.join(' · ')}</b>
            </>
          ) : (
            'showing the whole book for the selected period'
          )}
        </span>
      </div>
      <div className="kpis">
        {kpi('Active Clients', t.clients, `${t.n} projects`, C.slate)}
        {kpi('Avg Project Value', fmt(t.avg), 'per project, this period', C.gold)}
        {kpi('Top Client Share', top1 ? fmtP(pct(top1.rev, t.rev), 1) : '—', top1 ? top1.name : '', C.rust)}
        {kpi('Top-5 Concentration', fmtP(pct(top5, t.rev), 1), 'of period revenue', C.gold)}
        {kpi('Repeat Revenue', fmtP(pct(repeatRev, t.rev), 1), `from clients billed in ${fyLabel(fy - 1)}`, C.sage)}
        {kpi('Retainer Share', fmtP(pct(retRev, t.rev), 1), `export ${fmtP(pct(exportRev, t.rev), 1)} of revenue`, C.slate)}
      </div>

      <div className="sec">
        <span>Verticals &amp; Industries</span>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-t">Revenue &amp; Margin by Vertical</div>
          {cats.length ? (
            <SCChart
              cfg={{
                labels: cats.map((c) => (c.name.length > 20 ? `${c.name.slice(0, 19)}…` : c.name)),
                onClick: (i) => cats[i] && drills.catDrill(cats[i]!.name),
                series: [
                  { name: 'Revenue', data: cats.map((c) => c.rev), color: cats.map((c) => m.vColor[c.name] ?? C.slate) },
                  { name: 'GP %', kind: 'line', y2: true, pct: true, data: cats.map((c) => (c.gm == null ? null : +c.gm.toFixed(1))), color: C.ink },
                ],
              }}
            />
          ) : (
            <div className="cwrap"><ChartEmpty msg="No projects match the current filters." /></div>
          )}
        </div>
        <div className="card">
          <div className="card-t">Industries Worked</div>
          <div className="card-s">Repeat industries are where estimating is most reliable.</div>
          <div className="tscroll vscroll" style={{ maxHeight: 290 }}>
            {inds.length ? (
              <Tbl heads={['Industry', 'Projects', 'Revenue', 'GP %']} rows={inds.map((x) => [x.name, x.n, fmt(x.rev), <GpPill key="g" gp={x.gp} rev={x.rev} tg={tg} />])} clicks={inds.map((x) => () => drills.indDrill(x.name))} keys={inds.map((x) => x.name)} />
            ) : (
              <Empty icon={null}>No projects match.</Empty>
            )}
          </div>
        </div>
      </div>

      <div className="sec">
        <span>Clients</span>
      </div>
      <div className="g32">
        <div className="card">
          <div className="card-t">Revenue Concentration</div>
          <div className="card-s">Top clients with cumulative share — how much of the book rides on how few names.</div>
          {topN.length ? (
            <SCChart
              cfg={{
                labels: topN.map((c) => (c.name.length > 14 ? `${c.name.slice(0, 13)}…` : c.name)),
                onClick: (i) => topN[i] && drills.clientDrill(topN[i]!.name),
                series: [
                  { name: 'Revenue', data: topN.map((c) => c.rev), color: C.slateA },
                  { name: 'Cumulative %', kind: 'line', y2: true, pct: true, data: cumPct, color: C.gold },
                ],
              }}
            />
          ) : (
            <div className="cwrap"><ChartEmpty msg="No projects match the current filters." /></div>
          )}
        </div>
        <div className="card">
          <div className="card-t">Client Book</div>
          <div className="card-s">Click any row for the client&apos;s full history.</div>
          <div className="tscroll vscroll" style={{ maxHeight: 290 }}>
            {cli.length ? (
              <Tbl
                heads={['Client', 'Projects', 'Revenue', 'GP', 'GP %']}
                rows={cli.map((c) => [<b key="n">{c.name}</b>, c.n, fmt(c.rev), fmt(c.gp), <GpPill key="g" gp={c.gp} rev={c.rev} tg={tg} />])}
                clicks={cli.map((c) => () => drills.clientDrill(c.name))}
                keys={cli.map((c) => c.name)}
              />
            ) : (
              <Empty icon={null}>No projects match.</Empty>
            )}
          </div>
        </div>
      </div>

      <div className="sec">
        <span>Geography &amp; Model</span>
      </div>
      <div className="g32">
        <div className="card">
          <div className="card-t">Domestic vs Export · Retainer vs One-off</div>
          <div className="tscroll">
            <Tbl heads={['Segment', 'Projects', 'Clients', 'Revenue', 'Share', 'GP %']} rows={[...des, ...rts].map((x) => [<b key="n">{x.name}</b>, x.n, x.clients, fmt(x.rev), fmtP(pct(x.rev, t.rev), 1), <GpPill key="g" gp={x.gp} rev={x.rev} tg={tg} />])} keys={[...des, ...rts].map((x) => x.name)} />
          </div>
        </div>
        <div className="card">
          {des.length ? (
            <SCChart style={{ height: 230 }} cfg={{ donut: true, center: 'REVENUE', items: des.map((d2, i) => ({ label: d2.name, value: d2.rev, color: [C.slate, C.gold, C.sage][i % 3]! })) }} />
          ) : (
            <div className="cwrap" style={{ height: 230 }}><ChartEmpty msg="No projects match." /></div>
          )}
        </div>
      </div>

      <div className="sec">
        <span>Pricing Discipline</span>
      </div>
      <div className="kpis">
        {kpi('Pricing Floor', `${tg}%`, 'target gross margin', C.ink)}
        {kpi('Median Project GP', fmtP(median), 'pass-throughs excluded', median != null && median >= tg ? C.sage : C.rust)}
        {kpi('Underpriced Projects', under.length, `of ${core.length} priced below floor`, C.rust)}
        {kpi('Uplift Left on Table', fmt(uplift), `had they been quoted at ${tg}%`, C.gold)}
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-t">Rate Benchmark by Vertical</div>
          <div className="card-s">Median margin is a better anchor than average for quoting — averages get dragged by one big job.</div>
          <div className="tscroll">
            {benchCats.length ? (
              <Tbl
                heads={['Vertical', 'Projects', 'Median GP %', 'Avg GP %', 'Verdict']}
                rows={benchCats.map((b) => [b.name, b.n, fmtP(b.med), fmtP(b.avg), b.med >= tg ? <span key="v" className="pill g">quote here</span> : <span key="v" className="pill r">{(tg - b.med).toFixed(0)} pts low</span>])}
                keys={benchCats.map((b) => b.name)}
              />
            ) : (
              <Empty icon={null}>No projects match.</Empty>
            )}
          </div>
        </div>
        <div className="card">
          <div className="card-t">Underpriced Work</div>
          <div className="card-s">Delivered below the {tg}% floor. Each row shows the revenue it should have carried.</div>
          <div className="tscroll vscroll" style={{ maxHeight: 290 }}>
            {under.length ? (
              <Tbl
                heads={['Project', 'Client', 'Revenue', 'GP %', 'Should be']}
                rows={under.slice(0, 30).map((p) => [p.name, p.client, fmt(p.revenue), <GpPill key="g" gp={p.grossProfit} rev={p.revenue} tg={tg} />, fmt((p.revenue * tg) / 100)])}
                clicks={under.slice(0, 30).map((p) => () => drills.projDrill(p.id))}
                keys={under.slice(0, 30).map((p) => p.id)}
              />
            ) : (
              <Empty icon="✓">Nothing priced below the floor in this period.</Empty>
            )}
          </div>
        </div>
      </div>

      <div className="sec">
        <span>Project Extremes</span>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-t">Most Profitable Projects</div>
          <div className="card-s">Full list, ranked by gross profit.</div>
          <div className="tscroll vscroll" style={{ maxHeight: 430 }}>{ranked.length ? rankTbl(ranked) : <Empty icon={null}>No data.</Empty>}</div>
        </div>
        <div className="card">
          <div className="card-t">Margin Drag — Lowest Performers</div>
          <div className="card-s">Full list, worst first.</div>
          <div className="tscroll vscroll" style={{ maxHeight: 430 }}>{ranked.length ? rankTbl(ranked.slice().reverse()) : <Empty icon={null}>No data.</Empty>}</div>
        </div>
      </div>
    </>
  );
}
