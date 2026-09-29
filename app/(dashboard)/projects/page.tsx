'use client';

/**
 * Projects: the register behind every other page, with search, scope and
 * six filters, and a CSV of the filtered view.
 */

import { useState } from 'react';
import { Empty, Fbar, GpPill, Kpi, PageHead, downloadCSV } from '@/components/ui';
import { useDrills } from '@/lib/drawer';
import { C, PLABEL, agg, fmt, fmtP, fyLabel, fyOf, mLabel, periodMonths } from '@/lib/model';
import { useView } from '@/lib/use-model';

const EMPTY = { s: '', scope: 'all', vert: '', ind: '', cli: '', geo: '', model: '' };

export default function ProjectsPage() {
  const { m, fy, period } = useView();
  const [f, setF] = useState(EMPTY);
  const drills = useDrills(m, fy, period);
  const s = f.s.toLowerCase();
  const perSet = new Set(periodMonths(fy, period));
  const rows = m.P.filter(
    (p) =>
      (!s || p.name.toLowerCase().includes(s) || p.client.toLowerCase().includes(s)) &&
      (f.scope !== 'period' || perSet.has(p.ym)) &&
      (!f.vert || p.scat === f.vert) &&
      (!f.ind || p.industry === f.ind) &&
      (!f.cli || p.client === f.cli) &&
      (!f.geo || p.de === f.geo) &&
      (!f.model || (f.model === 'rt') === p.recurring),
  ).sort((a, b) => b.ym.localeCompare(a.ym) || b.revenue - a.revenue);
  const a = agg(rows);
  const tg = m.gpFloor(fy);
  const opt = (list: string[], label: string) => (
    <>
      <option value="">{label}</option>
      {list.map((x) => (
        <option key={x}>{x}</option>
      ))}
    </>
  );

  const exportView = () =>
    downloadCSV(
      rows.map((p) => [fyLabel(fyOf(p.ym)), p.ym, p.name, p.client, p.industry, p.scat, p.de, p.recurring ? 'Retainer' : 'One-off', p.revenue, p.cost, p.grossProfit]),
      ['FY', 'Month', 'Project', 'Client', 'Industry', 'Vertical', 'Market', 'Model', 'Revenue', 'Cost', 'GP'],
      'btg-projects-filtered.csv',
    );

  return (
    <>
      <Fbar m={m} fy={fy} period={period} />
      <PageHead eyebrow="The Data Behind It" title="Projects" desc="Every reported project in the book. Filter, inspect, export — this is the exact data every other page is computed from." />
      <div className="fbar">
        <input className="search" placeholder="Search project or client…" value={f.s} onChange={(e) => setF({ ...f, s: e.target.value })} />
        <select className="fsel" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
          <option value="all">All time</option>
          <option value="period">Selected period only</option>
        </select>
        <select className="fsel" value={f.vert} onChange={(e) => setF({ ...f, vert: e.target.value })}>
          {opt([...new Set(m.P.map((p) => p.scat))].sort(), 'All verticals')}
        </select>
        <select className="fsel" value={f.ind} onChange={(e) => setF({ ...f, ind: e.target.value })}>
          {opt([...new Set(m.P.map((p) => p.industry))].sort(), 'All industries')}
        </select>
        <select className="fsel" value={f.cli} onChange={(e) => setF({ ...f, cli: e.target.value })}>
          {opt([...new Set(m.P.map((p) => p.client))].sort(), 'All clients')}
        </select>
        <select className="fsel" value={f.geo} onChange={(e) => setF({ ...f, geo: e.target.value })}>
          <option value="">Domestic + export</option>
          <option value="Domestic">Domestic</option>
          <option value="Export">Export</option>
        </select>
        <select className="fsel" value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })}>
          <option value="">Retainer + one-off</option>
          <option value="rt">Retainer only</option>
          <option value="one">One-off only</option>
        </select>
        <button type="button" className="linkbtn" onClick={() => setF(EMPTY)}>
          Reset
        </button>
      </div>
      <div className="kpis">
        <Kpi label="Projects" value={a.n} sub="matching the filters" accent={C.ink} />
        <Kpi label="Revenue" value={fmt(a.rev)} sub="in this view" accent={C.slate} />
        <Kpi label="Gross Profit" value={fmt(a.gp)} sub={`${fmtP(a.gm)} margin`} accent={C.sage} />
        <Kpi label="Clients" value={a.clients} sub="distinct in this view" accent={C.gold} />
        <Kpi label="Avg Project" value={fmt(a.avg)} sub="revenue per project" accent={C.rust} />
      </div>
      <div className="card">
        <div className="card-hd">
          <div>
            <div className="card-t">Project Register</div>
            <div className="card-s">
              {a.n} of {m.P.length} projects{f.scope === 'period' ? ` · ${fyLabel(fy)} ${PLABEL[period]}` : ' · all time'} · sorted newest first · click a row for detail
            </div>
          </div>
          <button type="button" className="hbtn no-print" onClick={exportView}>
            ⬇ Export this view
          </button>
        </div>
        <div className="tscroll vscroll">
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Month</th>
                  <th>Industry</th>
                  <th>Vertical</th>
                  <th>Market</th>
                  <th>Model</th>
                  <th className="num">Revenue</th>
                  <th className="num">Cost</th>
                  <th className="num">GP</th>
                  <th className="num">GP %</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr className="click" key={p.id} onClick={() => drills.projDrill(p.id)}>
                    <td>
                      <b>{p.name}</b>
                    </td>
                    <td>{p.client}</td>
                    <td>{mLabel(p.ym)}</td>
                    <td>{p.industry}</td>
                    <td>{p.scat}</td>
                    <td>{p.de}</td>
                    <td>{p.recurring ? <span className="tag good">retainer</span> : 'one-off'}</td>
                    <td className="num">{fmt(p.revenue)}</td>
                    <td className="num">{fmt(p.cost)}</td>
                    <td className="num">{fmt(p.grossProfit)}</td>
                    <td className="num">
                      <GpPill gp={p.grossProfit} rev={p.revenue} tg={tg} />
                    </td>
                  </tr>
                ))}
                <tr className="tot">
                  <td colSpan={7}>Total · {a.n} projects</td>
                  <td className="num">{fmt(a.rev)}</td>
                  <td className="num">{fmt(a.cost)}</td>
                  <td className="num">{fmt(a.gp)}</td>
                  <td className="num">{fmtP(a.gm)}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <Empty>No projects match the current filters.</Empty>
          )}
        </div>
      </div>
    </>
  );
}
