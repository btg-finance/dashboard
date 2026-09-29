'use client';

/**
 * The details drawer: eyebrow, title, KPI strip, an
 * optional chart, the table of records behind the number, and a CSV of the
 * slice. Escape closes it; the back arrow returns to the previous drill.
 */

import { useEffect } from 'react';
import { useDrawer, useDrills } from '@/lib/drawer';
import { agg, fmt, fmtP, mLabel } from '@/lib/model';
import { useView } from '@/lib/use-model';
import { SCChart } from './sc-chart';
import { GpPill, Tbl, downloadCSV } from './ui';

export function Drawer() {
  const { cfg, canBack, wide, back, close, toggleWide } = useDrawer();
  const { m, fy, period } = useView();
  const drills = useDrills(m, fy, period);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  const isOn = cfg !== null;
  const rows = cfg?.rows ?? [];
  const a = agg(rows);
  const tg = m.gpFloor(fy);
  const kpis = cfg?.kpis ?? [
    { v: fmt(a.rev), l: 'Revenue' },
    { v: fmt(a.cost), l: 'Cost' },
    { v: fmt(a.gp), l: 'Gross Profit' },
    { v: fmtP(a.gm), l: 'GP Margin' },
    { v: String(a.n), l: 'Projects' },
  ];

  const download = () => {
    if (!cfg) return;
    if (rows.length) {
      downloadCSV(
        rows.map((p) => [p.ym, p.name, p.client, p.industry, p.scat, p.de, p.revenue, p.cost, p.grossProfit]),
        ['Month', 'Project', 'Client', 'Industry', 'Vertical', 'Market', 'Revenue', 'Cost', 'GP'],
        'btg-slice.csv',
      );
    } else if (cfg.slice && cfg.sliceHeads) {
      downloadCSV(cfg.slice, cfg.sliceHeads, 'btg-slice.csv');
    }
  };

  return (
    <>
      <div className={`dback ${isOn ? 'on' : ''}`} onClick={close} />
      <aside className={`drawer ${isOn ? 'on' : ''} ${wide ? 'wide' : ''}`}>
        <div className="dhead" style={{ position: 'relative' }}>
          <div className="eyebrow">{cfg?.eyebrow ?? 'Detail'}</div>
          <div className="dtitle">{cfg?.title ?? ''}</div>
          <div className="dsub">{cfg?.sub ?? ''}</div>
          <div className="dctl">
            {canBack ? (
              <button type="button" className="dbtn" onClick={back} title="Back">
                ←
              </button>
            ) : null}
            <button type="button" className="dbtn" onClick={toggleWide} title="Expand">
              ⤢
            </button>
            <button type="button" className="dbtn" onClick={close} title="Close">
              ✕
            </button>
          </div>
        </div>
        <div className="dbody">
          <div className="dkpis">
            {kpis.map((k, i) => (
              <div className="dkpi" key={i}>
                <div className="dkpi-v" style={{ color: k.c ?? 'var(--ink)' }}>
                  {k.v}
                </div>
                <div className="dkpi-l">{k.l}</div>
              </div>
            ))}
          </div>
          {cfg?.chart && isOn ? (
            <div className="card">
              <SCChart cfg={cfg.chart} style={{ height: 200 }} />
            </div>
          ) : null}
          <div className="card" style={{ padding: '14px 18px' }}>
            <div className="tscroll vscroll" style={{ maxHeight: '60vh' }}>
              {cfg?.html ??
                (rows.length ? (
                  <Tbl
                    heads={['Project', 'Client', 'Month', 'Vertical', 'Revenue', 'Cost', 'GP', 'GP %']}
                    rows={rows.map((p) => [p.name, p.client, mLabel(p.ym), String(p.scat || '').split(' ')[0], fmt(p.revenue), fmt(p.cost), fmt(p.grossProfit), <GpPill key="g" gp={p.grossProfit} rev={p.revenue} tg={tg} />])}
                    clicks={rows.map((p) => () => drills.projDrill(p.id))}
                    keys={rows.map((p) => p.id)}
                  />
                ) : (
                  <div className="empty">
                    <i>◦</i>
                    <p>No underlying records.</p>
                  </div>
                ))}
            </div>
          </div>
        </div>
        <div className="dfoot">
          <span>{rows.length} records</span>
          <button type="button" className="hbtn" onClick={download}>
            ⬇ Download this slice
          </button>
        </div>
      </aside>
    </>
  );
}
