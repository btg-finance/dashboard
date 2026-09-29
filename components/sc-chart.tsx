'use client';

/**
 * The chart engine: bars, stacked bars, lines on a first or second axis, and
 * a donut, all drawn as SVG with no library. Every bar and point is
 * labelled, columns show a tooltip, and a click hands back the column index.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { C, clamp, fmt, fmtCr, fmtP, lblFmt, pct, sum } from '@/lib/model';

export interface Series {
  name: string;
  data: Array<number | null>;
  /** One colour, or one per column. */
  color: string | string[];
  kind?: 'bar' | 'line';
  stack?: string;
  y2?: boolean;
  pct?: boolean;
  dash?: boolean;
}

export interface DonutItem {
  label: string;
  value: number;
  color: string;
}

export interface ChartCfg {
  labels?: string[];
  series?: Series[];
  onClick?: (index: number) => void;
  hideLegend?: boolean;
  pctAxis?: boolean;
  donut?: boolean;
  items?: DonutItem[];
  center?: string;
}

/** Text sizes inside a chart, in pixels: axis ticks, and the values on bars, lines and slices. */
const AXIS = 11;
const LABEL = 11.5;

/** Round an axis maximum up to 1, 2, 2.5, 5 or 10 times a power of ten. */
function nice(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

interface Tip {
  html: React.ReactNode;
  x: number;
  y: number;
}

function useSize(ref: React.RefObject<HTMLDivElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  useEffect(() => {
    if (!tip || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ left: clamp(tip.x + 14, 4, window.innerWidth - r.width - 8), top: clamp(tip.y - r.height - 10, 4, window.innerHeight - r.height - 4) });
  }, [tip]);
  if (!tip) return null;
  return (
    <div ref={ref} className="sc-tip-live" style={{ display: 'block', left: pos.left, top: pos.top }}>
      {tip.html}
    </div>
  );
}

export function ChartEmpty({ msg, height }: { msg: string; height?: number }) {
  return (
    <div className="empty" style={{ paddingTop: Math.max(10, (height ?? 220) / 2 - 46) }}>
      <i>◦</i>
      <p>{msg}</p>
    </div>
  );
}

export function SCChart({ cfg, className = 'cwrap', style }: { cfg: ChartCfg; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const size = useSize(ref);
  const [tip, setTip] = useState<Tip | null>(null);

  const body = useMemo(() => {
    if (!size.w) return null;
    if (cfg.donut) return renderDonut(cfg, size, setTip);
    return renderCartesian(cfg, size, setTip);
  }, [cfg, size]);

  return (
    <div ref={ref} className={className} style={style}>
      {body}
      <Tooltip tip={tip} />
    </div>
  );
}

function legend(cfg: ChartCfg) {
  if (cfg.hideLegend) return null;
  return (
    <div className="sc-legend">
      {(cfg.series ?? []).map((s) => (
        <span key={s.name}>
          <i className={s.kind === 'line' ? 'line' : ''} style={{ background: Array.isArray(s.color) ? s.color[0] : s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

function renderCartesian(cfg: ChartCfg, size: { w: number; h: number }, setTip: (t: Tip | null) => void) {
  const labels = cfg.labels ?? [];
  const series = cfg.series ?? [];
  const legendH = cfg.hideLegend ? 0 : 24;
  const Wpx = Math.max(320, size.w || 640);
  const Hpx = Math.max(150, (size.h || 250) - legendH);
  const n = labels.length;
  const hasY2 = series.some((s) => s.y2);
  const rot = n > 9 || (Wpx - 70) / n < 60;
  const padL = 66;
  const padR = hasY2 ? 48 : 8;
  const padT = 16;
  const padB = rot ? 48 : 28;
  const plotW = Wpx - padL - padR;
  const plotH = Hpx - padT - padB;

  const stacks: Record<string, Series[]> = {};
  let y1max = 0;
  let y1min = 0;
  for (const s of series.filter((s) => !s.y2)) {
    if (s.kind === 'line' || !s.stack) {
      for (const v of s.data) {
        if (v != null) {
          y1max = Math.max(y1max, v);
          y1min = Math.min(y1min, v);
        }
      }
    }
    if (s.kind !== 'line' && s.stack) (stacks[s.stack] ??= []).push(s);
  }
  for (const group of Object.values(stacks)) {
    for (let i = 0; i < n; i++) {
      let pos = 0;
      let neg = 0;
      for (const s of group) {
        const v = s.data[i] ?? 0;
        if (v >= 0) pos += v;
        else neg += v;
      }
      y1max = Math.max(y1max, pos);
      y1min = Math.min(y1min, neg);
    }
  }
  y1max = nice(y1max * 1.15) || 1;
  y1min = y1min < 0 ? -nice(-y1min * 1.1) : 0;
  const y1 = (v: number) => padT + ((y1max - v) / (y1max - y1min)) * plotH;

  let y2max = 0;
  let y2min = 0;
  for (const s of series.filter((s) => s.y2)) {
    for (const v of s.data) {
      if (v != null) {
        y2max = Math.max(y2max, v);
        y2min = Math.min(y2min, v);
      }
    }
  }
  y2max = Math.max(10, nice(y2max * 1.18));
  y2min = y2min < 0 ? -nice(-y2min * 1.1) : 0;
  const y2 = (v: number) => padT + ((y2max - v) / (y2max - y2min)) * plotH;

  const band = plotW / n;
  const xC = (i: number) => padL + band * (i + 0.5);
  const axFmt = cfg.pctAxis ? (v: number) => `${v.toFixed(0)}%` : fmtCr;
  const ticks = 4;

  const soloBars = series.filter((s) => s.kind !== 'line' && !s.stack && !s.y2);
  const stackKeys = Object.keys(stacks);
  const cols = soloBars.length + (stackKeys.length ? 1 : 0) || 1;
  const bw = Math.min(30, (band * 0.72) / cols);
  const groupW = bw * cols;
  const gx0 = (i: number) => xC(i) - groupW / 2;
  const barLbl = (x: number, v: number, key: string) =>
    v ? (
      <text key={key} x={x} y={v >= 0 ? y1(v) - 5 : y1(v) + 14} textAnchor="middle" fontSize={LABEL} fontWeight="600" fill={C.ink}>
        {cfg.pctAxis ? `${v.toFixed(0)}%` : lblFmt(v)}
      </text>
    ) : null;

  const els: React.ReactNode[] = [];
  for (let i = 0; i <= ticks; i++) {
    const v = y1min + ((y1max - y1min) * i) / ticks;
    const yy = y1(v);
    els.push(<line key={`g${i}`} x1={padL} x2={Wpx - padR} y1={yy} y2={yy} stroke={C.grid} strokeWidth="1" />);
    els.push(
      <text key={`gt${i}`} x={padL - 7} y={yy + 4} textAnchor="end" fontSize={AXIS} fill={C.ink3}>
        {axFmt(v)}
      </text>,
    );
  }
  if (hasY2) {
    for (let i = 0; i <= ticks; i++) {
      const v = y2min + ((y2max - y2min) * i) / ticks;
      els.push(
        <text key={`y2t${i}`} x={Wpx - padR + 6} y={y2(v) + 4} textAnchor="start" fontSize={AXIS} fill={C.ink3}>
          {v.toFixed(0)}%
        </text>,
      );
    }
  }
  if (y1min < 0) els.push(<line key="zero" x1={padL} x2={Wpx - padR} y1={y1(0)} y2={y1(0)} stroke={C.ink3} strokeWidth="1" />);

  soloBars.forEach((s, si) => {
    for (let i = 0; i < n; i++) {
      const v = s.data[i];
      if (v == null) continue;
      const yy = y1(Math.max(0, v));
      const hh = Math.abs(y1(v) - y1(0));
      const color = Array.isArray(s.color) ? s.color[i] : s.color;
      els.push(<rect key={`b${si}-${i}`} x={gx0(i) + bw * si + 1} y={v >= 0 ? yy : y1(0)} width={bw - 2} height={Math.max(1.5, hh)} fill={color} />);
      els.push(barLbl(gx0(i) + bw * si + bw / 2, v, `bl${si}-${i}`));
    }
  });
  stackKeys.forEach((k) => {
    const group = stacks[k]!;
    const sx = soloBars.length;
    for (let i = 0; i < n; i++) {
      let accP = 0;
      let accN = 0;
      group.forEach((s, gi) => {
        const v = s.data[i] ?? 0;
        if (!v) return;
        let yTop: number;
        let hh: number;
        if (v >= 0) {
          yTop = y1(accP + v);
          hh = y1(accP) - yTop;
          accP += v;
        } else {
          yTop = y1(accN);
          hh = y1(accN + v) - yTop;
          accN += v;
        }
        els.push(<rect key={`s${k}-${gi}-${i}`} x={gx0(i) + bw * sx + 1} y={yTop} width={bw - 2} height={Math.max(1, hh)} fill={s.color as string} />);
      });
      if (accP > 0) {
        els.push(
          <text key={`sl${k}-${i}`} x={gx0(i) + bw * sx + bw / 2} y={y1(accP) - 5} textAnchor="middle" fontSize={LABEL} fontWeight="600" fill={C.ink}>
            {lblFmt(accP)}
          </text>,
        );
      }
    }
  });
  series
    .filter((s) => s.kind === 'line')
    .forEach((s, li) => {
      const Y = s.y2 ? y2 : y1;
      let d = '';
      let started = false;
      const dy = li % 2 === 0 ? -9 : 17;
      const pts: React.ReactNode[] = [];
      for (let i = 0; i < n; i++) {
        const v = s.data[i];
        if (v == null) {
          started = false;
          continue;
        }
        d += `${started ? ' L' : ' M'}${xC(i).toFixed(1)} ${Y(v).toFixed(1)}`;
        started = true;
        pts.push(<circle key={`c${li}-${i}`} cx={xC(i)} cy={Y(v)} r="3" fill={s.color as string} />);
        pts.push(
          <text key={`ct${li}-${i}`} x={xC(i)} y={Y(v) + dy} textAnchor="middle" fontSize={LABEL} fontWeight="600" fill={s.color as string} stroke="#fff" strokeWidth="3.5" strokeLinejoin="round" paintOrder="stroke">
            {s.pct || s.y2 ? `${v.toFixed(0)}%` : lblFmt(v)}
          </text>,
        );
      }
      els.push(<path key={`l${li}`} d={d.trim()} fill="none" stroke={s.color as string} strokeWidth="2" strokeDasharray={s.dash ? '5 4' : undefined} />);
      els.push(...pts);
    });
  for (let i = 0; i < n; i++) {
    const lx = xC(i);
    const ly = Hpx - padB + 17;
    els.push(
      rot ? (
        <text key={`x${i}`} x={lx} y={ly} fontSize={AXIS} fill={C.ink3} textAnchor="end" transform={`rotate(-32 ${lx} ${ly})`}>
          {labels[i]}
        </text>
      ) : (
        <text key={`x${i}`} x={lx} y={ly} fontSize={AXIS} fill={C.ink3} textAnchor="middle">
          {labels[i]}
        </text>
      ),
    );
  }
  for (let i = 0; i < n; i++) {
    els.push(
      <rect
        key={`h${i}`}
        x={padL + band * i}
        y={padT}
        width={band}
        height={plotH}
        fill="transparent"
        style={{ cursor: cfg.onClick ? 'pointer' : 'default' }}
        onMouseMove={(e) =>
          setTip({
            x: e.clientX,
            y: e.clientY,
            html: (
              <>
                <b>{labels[i]}</b>
                {series.map((s) => {
                  const v = s.data[i];
                  return (
                    <span key={s.name} style={{ display: 'block' }}>
                      {s.name}: {v == null ? '—' : s.pct ? fmtP(v) : fmt(v)}
                    </span>
                  );
                })}
              </>
            ),
          })
        }
        onMouseLeave={() => setTip(null)}
        onClick={() => {
          setTip(null);
          cfg.onClick?.(i);
        }}
      />,
    );
  }

  return (
    <>
      <svg width="100%" height={Hpx} viewBox={`0 0 ${Wpx} ${Hpx}`} preserveAspectRatio="xMidYMid meet">
        {els}
      </svg>
      {legend(cfg)}
    </>
  );
}

function renderDonut(cfg: ChartCfg, size: { w: number; h: number }, setTip: (t: Tip | null) => void) {
  const items = cfg.items ?? [];
  const Wpx = Math.max(220, size.w || 420);
  const Hpx = Math.max(150, (size.h || 250) - 30);
  const cx = Wpx / 2;
  const cy = Hpx / 2;
  const R = Math.min(Wpx, Hpx) / 2 - 6;
  const r = R * 0.62;
  const tot = sum(items, (x) => x.value) || 1;
  let a0 = -Math.PI / 2;
  const p = (a: number, rad: number) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
  const arcs = items.map((it, i) => {
    const frac = it.value / tot;
    const a1 = a0 + frac * 2 * Math.PI;
    const large = frac > 0.5 ? 1 : 0;
    const d = `M ${p(a0, R)} A ${R} ${R} 0 ${large} 1 ${p(a1, R)} L ${p(a1, r)} A ${r} ${r} 0 ${large} 0 ${p(a0, r)} Z`;
    const mid = a0 + frac * Math.PI;
    a0 = a1;
    return { d, it, i, frac, mid };
  });
  const lr = (R + r) / 2;
  return (
    <>
      <svg width="100%" height={Hpx} viewBox={`0 0 ${Wpx} ${Hpx}`} preserveAspectRatio="xMidYMid meet">
        {arcs.map((a) => (
          <path
            key={a.i}
            d={a.d}
            fill={a.it.color}
            stroke="#fff"
            strokeWidth="1.6"
            style={{ cursor: cfg.onClick ? 'pointer' : 'default' }}
            onMouseMove={(e) =>
              setTip({
                x: e.clientX,
                y: e.clientY,
                html: (
                  <>
                    <b>{a.it.label}</b>
                    <br />
                    {fmt(a.it.value)} · {fmtP(pct(a.it.value, tot), 1)}
                  </>
                ),
              })
            }
            onMouseLeave={() => setTip(null)}
            onClick={() => {
              setTip(null);
              cfg.onClick?.(a.i);
            }}
          />
        ))}
        {arcs
          .filter((a) => a.frac >= 0.055)
          .map((a) => (
            <text key={`t${a.i}`} x={cx + lr * Math.cos(a.mid)} y={cy + lr * Math.sin(a.mid) + 4} textAnchor="middle" fontSize={LABEL} fontWeight="600" fill="#fff">
              {(a.frac * 100).toFixed(0)}%
            </text>
          ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize="17" fontWeight="600" fill={C.ink}>
          {fmtCr(tot)}
        </text>
        <text x={cx} y={cy + 15} textAnchor="middle" fontSize="10" fill={C.ink3} letterSpacing="1">
          {cfg.center ?? 'TOTAL'}
        </text>
      </svg>
      <div className="sc-legend">
        {items.slice(0, 6).map((it) => (
          <span key={it.label}>
            <i style={{ background: it.color }} />
            {it.label.length > 20 ? `${it.label.slice(0, 19)}…` : it.label}
          </span>
        ))}
      </div>
    </>
  );
}
