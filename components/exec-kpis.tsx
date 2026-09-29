'use client';

/**
 * The four headline tiles of the Executive Summary, with their pace meters.
 */

import { Delta, Kpi, Meter, paceCls } from '@/components/ui';
import type { useDrills } from '@/lib/drawer';
import { C, fmt, fmtP, pct, type ExecKpiData } from '@/lib/model';

/** The four headline tiles. */
export function ExecKpis({ d, drills }: { d: ExecKpiData; drills: ReturnType<typeof useDrills> }) {
  const { T, a, pa } = d;
  const revFill = T && d.tRev ? pct(a.rev, d.tRev) : null;
  const revMark = T && d.tRev && d.expRev != null ? pct(d.expRev, d.tRev) : null;
  const gpFill = T && d.tGP ? pct(a.gp, d.tGP) : null;
  const gpMark = T && d.tGP && d.expGP != null ? pct(d.expGP, d.tGP) : null;
  const tiles = [
    <Kpi
      key="rev"
      label="Revenue"
      value={fmt(a.rev)}
      accent={C.slate}
      onClick={() => drills.drillKind('rev')}
      meter={<Meter fill={revFill} mark={revMark} cls={paceCls(revFill, revMark)} cap={T ? ['0', fmt(d.tRev)] : null} />}
      sub={
        T ? (
          <>
            <b>{fmtP(revFill, 0)}</b> of target · pace ~{fmtP(revMark, 0)} · <Delta cur={a.rev} prev={pa.rev} /> YoY
          </>
        ) : (
          <>
            <Delta cur={a.rev} prev={pa.rev} /> YoY · no target on record
          </>
        )
      }
    />,
    <Kpi
      key="gp"
      label="Gross Profit"
      value={fmt(a.gp)}
      accent={C.sage}
      onClick={() => drills.drillKind('gp')}
      meter={<Meter fill={gpFill} mark={gpMark} cls={paceCls(gpFill, gpMark)} cap={T ? ['0', fmt(d.tGP)] : null} />}
      sub={
        T ? (
          <>
            <b>{fmtP(gpFill, 0)}</b> of target · pace ~{fmtP(gpMark, 0)} · <Delta cur={a.gp} prev={pa.gp} /> YoY
          </>
        ) : (
          <>
            <Delta cur={a.gp} prev={pa.gp} /> YoY
          </>
        )
      }
    />,
    <Kpi
      key="gm"
      label="Gross Margin"
      value={fmtP(a.gm)}
      accent={C.gold}
      onClick={() => drills.drillKind('gp')}
      sub={
        <>
          {T ? (
            <>
              target <b>{T.gpPct}%</b> ·{' '}
            </>
          ) : null}
          <Delta cur={a.gm} prev={pa.gm} pts /> YoY
        </>
      }
    />,
    <Kpi
      key="eb"
      label="EBITDA Margin"
      value={d.ebPct == null ? 'n/a' : fmtP(d.ebPct)}
      accent={C.rust}
      onClick={() => drills.drillKind('ebitda')}
      sub={
        d.ebPct == null ? (
          d.rep.length ? 'overheads missing for a reported month' : 'no month reported yet'
        ) : (
          <>
            <b>{fmt(d.eb)}</b>
            {T ? ` · target ${fmtP(d.tEbPct, 0)}` : ''} · <Delta cur={d.ebPct} prev={d.ebPrevPct} pts /> YoY
          </>
        )
      }
    />,
  ];
  return <>{tiles}</>;
}

