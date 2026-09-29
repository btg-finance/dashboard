/**
 * What the chat is told about the business: the same figures the pages show,
 * as plain JSON. Built on the server from the sheets, so the assistant only
 * ever sees real numbers. Amounts carry a formatted twin (`…Fmt`) so the
 * assistant quotes figures rather than converting them.
 */

import { COMMITTED_FROM, PLABEL, agg, fmt, fyLabel, fyMonths, groupBy, kindOf, pct, sum, type Model } from './model';
import type { FinancialYear, Period, Project } from './types';

const TOP_CLIENTS = 15;

const marginPct = (rows: Project[]): number => +(pct(sum(rows, (p) => p.grossProfit), sum(rows, (p) => p.revenue)) ?? 0).toFixed(1);

function yearActuals(m: Model, fy: FinancialYear) {
  const rep = m.reported(fyMonths(fy));
  const ps = m.inMonths(rep);
  const a = agg(ps);
  const o = m.ohFor(rep);
  return {
    partial: rep.length < 12,
    reportedMonths: rep.length,
    revenue: a.rev,
    revenueFmt: fmt(a.rev),
    grossProfit: a.gp,
    grossProfitFmt: fmt(a.gp),
    gmPct: a.gm == null ? null : +a.gm.toFixed(1),
    overheads: o.total,
    overheadsFmt: fmt(o.total),
    ebitda: a.gp - o.total,
    ebitdaFmt: fmt(a.gp - o.total),
    projects: a.n,
    clients: a.clients,
    monthly: Object.fromEntries(
      rep.map((mo) => {
        const month = agg(m.inMonths([mo]));
        return [mo, { rev: month.rev, gp: month.gp, oh: m.ohMap[mo]?.total ?? 0 }];
      }),
    ),
    topClients: Object.entries(groupBy(ps, (p) => p.client))
      .map(([client, rows]) => ({ client, rev: sum(rows, (p) => p.revenue), gpPct: marginPct(rows) }))
      .sort((x, y) => y.rev - x.rev)
      .slice(0, TOP_CLIENTS),
    byVertical: Object.entries(groupBy(ps, (p) => p.scat)).map(([vertical, rows]) => ({ vertical, rev: sum(rows, (p) => p.revenue), gpPct: marginPct(rows) })),
    byIndustry: Object.entries(groupBy(ps, (p) => p.industry))
      .map(([industry, rows]) => ({ industry, rev: sum(rows, (p) => p.revenue) }))
      .sort((x, y) => y.rev - x.rev),
  };
}

/** The business data. The same for every question until the sheets change. */
export function buildContext(m: Model): unknown {
  return {
    company: `BTG Studios — content & branding studio (India). FY runs Apr–Mar; ${fyLabel(m.curFY)} = Apr ${m.curFY - 1}–Mar ${m.curFY}. Quarters: Q1 Apr–Jun, Q2 Jul–Sep, Q3 Oct–Dec, Q4 Jan–Mar. All amounts in whole rupees. Data reported through ${m.dataThrough}.`,
    actualsByFY: Object.fromEntries(m.FYS.map((fy) => [fyLabel(fy), yearActuals(m, fy)])),
    targets: Object.fromEntries(
      Object.entries(m.TGT).map(([fy, t]) => [
        fyLabel(Number(fy)),
        {
          revenueTarget: t.rev,
          revenueTargetFmt: fmt(t.rev),
          grossProfitTarget: t.gp,
          grossProfitTargetFmt: fmt(t.gp),
          ebitdaTarget: t.ebitda,
          ebitdaTargetFmt: fmt(t.ebitda),
          targetGpPct: t.gpPct,
          quarters: t.q?.map((q, i) => ({ quarter: `Q${i + 1}`, revenueTarget: q.rev, revenueTargetFmt: fmt(q.rev), grossProfitTarget: q.gp, grossProfitTargetFmt: fmt(q.gp) })),
        },
      ]),
    ),
    pipelineRules:
      `All of an opportunity's revenue lands in its start month. Weighted = gross x stage probability. ` +
      `Committed pipeline is probability ${COMMITTED_FROM * 100}% and above; the rest is weighted pipeline. ` +
      `Gap to target = target - reported - committed - weighted. An opportunity whose start month is already reported is not counted.`,
    pipeline: m.PIPE.map((r) => ({
      name: r.n,
      client: r.client,
      owner: r.owner,
      vertical: r.v,
      kind: kindOf(r),
      stage: r.stage,
      probabilityPct: Math.round(r.p * 100),
      startMonth: r.start,
      counted: r.start > m.dataThrough,
      fy: fyLabel(r.fy),
      gross: r.rev,
      weighted: r.rev * r.p,
      estGpPct: +((1 - r.cp) * 100).toFixed(0),
      weightedGp: r.rev * r.p * (1 - r.cp),
    })),
  };
}

/** What the person asking is looking at. */
export function buildViewing(fy: FinancialYear, period: Period, page: string): unknown {
  return { fy: fyLabel(fy), period: PLABEL[period], page };
}
