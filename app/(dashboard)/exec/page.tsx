'use client';

/**
 * Executive Summary: the headline tiles with pace meters, the plain-language
 * lines, three trend charts with an M / Q / Y toggle, the revenue mix and the
 * pipeline outlook.
 */

import { useState } from 'react';
import { ChartEmpty, SCChart } from '@/components/sc-chart';
import { ExecKpis } from '@/components/exec-kpis';
import { Delta, Fbar, PageHead, WfRow } from '@/components/ui';
import { useDrills } from '@/lib/drawer';
import { C, PLABEL, agg, fmt, fmtP, fyLabel, fyMonths, groupBy, kindOf, mLabel, pct, periodMonths, sum, type Model } from '@/lib/model';
import { useView } from '@/lib/use-model';

type TrendMode = 'm' | 'q' | 'y';
const TREND_SUBS: Record<TrendMode, string> = { m: 'Last 12 reported months', q: 'Last 8 quarters', y: 'Financial years on record' };

function TrendCard({ kind, title, m, mode, setMode, drills }: { kind: 'rev' | 'gp' | 'eb'; title: string; m: Model; mode: TrendMode; setMode: (x: TrendMode) => void; drills: ReturnType<typeof useDrills> }) {
  const needOH = kind === 'eb';
  const pers = m.trendPeriods(mode, needOH);
  const sub = `${TREND_SUBS[mode]} · through ${mLabel(m.dataThrough)}${pers.some((p) => p.partial) ? ' · ◦ marks a partial period' : ''}${needOH ? ' · months with overhead records only' : ''}`;
  const vals = pers.map((x) => {
    const a = agg(m.inMonths(x.months));
    const o = m.ohFor(x.months);
    return { ...x, rev: a.rev, gp: a.gp, gm: a.gm, eb: a.gp - o.total, ebp: pct(a.gp - o.total, a.rev) };
  });
  const labels = vals.map((v) => v.label + (v.partial ? ' ◦' : ''));
  const onClick = (i: number) => {
    const per = pers[i];
    if (per) drills.periodDrill(per);
  };
  const cfg =
    kind === 'rev'
      ? { labels, onClick, series: [{ name: 'Revenue', data: vals.map((v) => v.rev), color: C.slateA }] }
      : kind === 'gp'
        ? {
            labels,
            onClick,
            series: [
              { name: 'Gross Profit', data: vals.map((v) => v.gp), color: C.sageA },
              { name: 'GM %', kind: 'line' as const, y2: true, pct: true, data: vals.map((v) => (v.gm == null ? null : +v.gm.toFixed(1))), color: C.gold },
            ],
          }
        : {
            labels,
            onClick,
            series: [
              { name: 'EBITDA', data: vals.map((v) => v.eb), color: vals.map((v) => (v.eb >= 0 ? C.goldA : C.rustA)) },
              { name: 'EBITDA %', kind: 'line' as const, y2: true, pct: true, dash: true, data: vals.map((v) => (v.ebp == null ? null : +v.ebp.toFixed(1))), color: C.ink },
            ],
          };
  return (
    <div className="card">
      <div className="card-hd">
        <div>
          <div className="card-t">{title}</div>
          <div className="card-s">{sub}</div>
        </div>
        <div className="tgl">
          {(['m', 'q', 'y'] as TrendMode[]).map((x) => (
            <button key={x} type="button" className={mode === x ? 'on' : ''} onClick={() => setMode(x)}>
              {x.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      {pers.length ? <SCChart cfg={cfg} /> : <div className="cwrap"><ChartEmpty msg={needOH ? 'No periods with complete overhead records yet.' : 'No reported data.'} /></div>}
    </div>
  );
}

export default function ExecPage() {
  const { m, fy, period } = useView();
  const [trend, setTrend] = useState<Record<'rev' | 'gp' | 'eb', TrendMode>>({ rev: 'q', gp: 'q', eb: 'q' });
  const drills = useDrills(m, fy, period);
  const months = periodMonths(fy, period);
  const d = m.execKpiData(fy, months);
  const { a, T } = d;

  const lines: React.ReactNode[] = [];
  if (T && d.tRev) {
    const revFill = pct(a.rev, d.tRev);
    const revMark = d.expRev != null ? pct(d.expRev, d.tRev) : null;
    const behind = (d.expRev ?? 0) - a.rev;
    lines.push(
      <span key="l1">
        Revenue stands at <b>{fmt(a.rev)}</b> — {fmtP(revFill, 0)} of the {fmt(d.tRev)} target against ~{fmtP(revMark, 0)} expected by {mLabel(m.dataThrough)}:{' '}
        <b>{behind > 0 ? `${fmt(behind)} behind pace` : 'on pace'}</b>
        {d.pa.rev ? (
          <>
            , <Delta cur={a.rev} prev={d.pa.rev} /> on the same period last year
          </>
        ) : null}
        .
      </span>,
    );
    lines.push(
      <span key="l2">
        Gross margin is <b>{fmtP(a.gm)}</b> against the {T.gpPct}% floor
        {d.ebPct != null ? `; EBITDA ${fmt(d.eb)} (${fmtP(d.ebPct)}) vs a ${fmtP(d.tEbPct, 0)} target margin` : ''}.
      </span>,
    );
    const fyRep = m.reported(fyMonths(fy));
    const fyRev = sum(m.inMonths(fyRep), (p) => p.revenue);
    const com = m.pipeInMonths(fy, fyMonths(fy), 'committed');
    const wtd = m.pipeInMonths(fy, fyMonths(fy), 'weighted');
    if (com.val || wtd.val) {
      lines.push(
        <span key="l3">
          For the full year, reported {fmt(fyRev)} + committed {fmt(com.w)} + weighted pipeline {fmt(wtd.w)} projects <b>{fmt(fyRev + com.w + wtd.w)}</b> —{' '}
          {fmtP(pct(fyRev + com.w + wtd.w, T.rev), 0)} of the {fmt(T.rev)} year.
        </span>,
      );
    }
  } else {
    lines.push(
      <span key="l1">
        Revenue <b>{fmt(a.rev)}</b> · gross profit <b>{fmt(a.gp)}</b> ({fmtP(a.gm)}){d.ebPct != null ? ` · EBITDA ${fmt(d.eb)} (${fmtP(d.ebPct)})` : ''} — no target on record for {fyLabel(fy)}.
      </span>,
    );
    if (d.pa.rev) {
      lines.push(
        <span key="l2">
          Against the same period {fyLabel(fy - 1)}: revenue <Delta cur={a.rev} prev={d.pa.rev} />, gross profit <Delta cur={a.gp} prev={d.pa.gp} />, margin <Delta cur={a.gm} prev={d.pa.gm} pts />.
        </span>,
      );
    }
  }

  const rows = m.inMonths(d.rep);
  const cats = Object.entries(groupBy(rows, (p) => p.scat))
    .map(([k, v]) => [k, sum(v, (p) => p.revenue)] as const)
    .sort((x, y) => y[1] - x[1]);

  const fyRep2 = m.reported(fyMonths(fy));
  const fyA = agg(m.inMonths(fyRep2));
  const com2 = m.pipeInMonths(fy, fyMonths(fy), 'committed');
  const wtd2 = m.pipeInMonths(fy, fyMonths(fy), 'weighted');
  const Tf = m.targetFor(fy);
  const gap = Tf ? Math.max(0, Tf.rev - fyA.rev - com2.w - wtd2.w) : 0;
  const open = m.pipeRows(fy);

  return (
    <>
      <Fbar m={m} fy={fy} period={period} />
      <PageHead eyebrow="BTG Studios · Executive Summary" title={`${fyLabel(fy)} at a Glance`} desc={`${PLABEL[period]} · reported through ${mLabel(m.dataThrough)} (${d.rep.length} of ${months.length} months) · ${a.n} projects · ${a.clients} clients`} />
      <div className="kpis k4">
        <ExecKpis d={d} drills={drills} />
      </div>
      <div className="lines-box">
        {lines.map((l, i) => (
          <span key={i}>
            {l}
            {i < lines.length - 1 ? <br /> : null}
          </span>
        ))}
      </div>
      <div className="g2">
        <TrendCard kind="rev" title="Revenue" m={m} mode={trend.rev} setMode={(x) => setTrend({ ...trend, rev: x })} drills={drills} />
        <TrendCard kind="gp" title="Gross Profit & Margin" m={m} mode={trend.gp} setMode={(x) => setTrend({ ...trend, gp: x })} drills={drills} />
      </div>
      <div className="g2">
        <TrendCard kind="eb" title="EBITDA" m={m} mode={trend.eb} setMode={(x) => setTrend({ ...trend, eb: x })} drills={drills} />
        <div className="card">
          <div className="card-t">Revenue Mix</div>
          <div className="card-s">By vertical, for the selected period. Click a slice for its projects.</div>
          {cats.length ? (
            <SCChart cfg={{ donut: true, center: 'REVENUE', items: cats.map((c) => ({ label: c[0], value: c[1], color: m.vColor[c[0]] ?? C.slate })), onClick: (i) => cats[i] && drills.catDrill(cats[i]![0]) }} />
          ) : (
            <div className="cwrap"><ChartEmpty msg="No projects in this period." /></div>
          )}
        </div>
      </div>
      <div className="card">
        <div className="card-t">Pipeline Outlook</div>
        <div className="card-s">Full {fyLabel(fy)} — what&apos;s reported, what&apos;s realistically coming, and the gap. Detail on the Forecast page.</div>
        <div className="g32" style={{ alignItems: 'center' }}>
          <div className="wf">
            {Tf ? (
              <>
                <WfRow label="FY Target" val={Tf.rev} max={Tf.rev} color={C.ink} />
                <WfRow label="Reported" val={fyA.rev} max={Tf.rev} color={C.sage} />
                <WfRow label="Committed pipeline" val={com2.w} max={Tf.rev} color={C.gold} />
                <WfRow label="Weighted pipeline" val={wtd2.w} max={Tf.rev} color={C.slate} />
                <WfRow label="Gap" val={gap} max={Tf.rev} color={C.rust} />
              </>
            ) : null}
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--ink3)', lineHeight: 1.7 }}>
            {Tf ? (
              <>
                Projected finish <b>{fmt(fyA.rev + com2.w + wtd2.w)}</b> — {fmtP(pct(fyA.rev + com2.w + wtd2.w, Tf.rev), 0)} of the year.{' '}
                {gap > 0 ? (
                  <>
                    <b style={{ color: 'var(--rust)' }}>{fmt(gap)}</b> still has no name against it.
                  </>
                ) : (
                  'The year is covered on paper — now close it.'
                )}
                <br />
                {open.length} open opportunities ({open.filter((r) => kindOf(r) === 'committed').length} committed · {open.filter((r) => kindOf(r) === 'weighted').length} weighted).
              </>
            ) : (
              <div className="empty">
                <i>◦</i>
                <p>No target on record for {fyLabel(fy)} — the forecast is maintained for {Object.keys(m.TGT).map((y) => fyLabel(+y)).join(', ') || '—'}.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
