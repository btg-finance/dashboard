'use client';

/**
 * How an assistant reply is shown. The model writes light markdown, with an
 * optional fenced `chart` block holding a JSON spec; text renders as
 * paragraphs, lists, tables and bold, and each chart block is drawn with the
 * dashboard's own chart engine. No HTML from the model is ever injected.
 */

import { SCChart, type ChartCfg } from '@/components/sc-chart';
import { C } from '@/lib/model';

/** The spec the model is asked to produce, in rupees. */
export interface ChartSpec {
  type?: 'bar' | 'line';
  title?: string;
  labels: string[];
  series: Array<{ name: string; data: Array<number | null>; kind?: 'bar' | 'line'; pct?: boolean }>;
}

const PALETTE = [C.slateA, C.sageA, C.goldA, C.rustA, C.slate, C.sage];

export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const spec = JSON.parse(raw) as ChartSpec;
    if (!Array.isArray(spec.labels) || !Array.isArray(spec.series) || !spec.series.length) return null;
    return spec;
  } catch {
    return null;
  }
}

/** Turn the model's spec into the chart engine's config. */
export function chartCfg(spec: ChartSpec): ChartCfg {
  const anyPct = spec.series.some((s) => s.pct);
  return {
    labels: spec.labels,
    pctAxis: anyPct && spec.series.every((s) => s.pct),
    series: spec.series.map((s, i) => ({
      name: s.name,
      data: s.data.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)),
      color: s.kind === 'line' ? (PALETTE[(i + 4) % PALETTE.length] ?? C.gold) : (PALETTE[i % PALETTE.length] ?? C.slateA),
      kind: s.kind === 'line' || (spec.type === 'line' && !s.kind) ? 'line' : 'bar',
      y2: Boolean(s.pct) && !spec.series.every((x) => x.pct),
      pct: Boolean(s.pct),
    })),
  };
}

/* ── a small, safe markdown renderer ─────────────────────────────────────── */

function inline(text: string, key: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={`${key}-${i}`}>{p.slice(2, -2)}</b> : <span key={`${key}-${i}`}>{p}</span>));
}

function Table({ lines, k }: { lines: string[]; k: string }) {
  const rows = lines.filter((l) => !/^\|?\s*:?-{2,}/.test(l)).map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const [head, ...body] = rows;
  if (!head) return null;
  return (
    <div className="tscroll" style={{ margin: '6px 0' }}>
      <table>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={i > 0 ? 'num' : ''}>
                {inline(h, `${k}h${i}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) => (
                <td key={i} className={i > 0 ? 'num' : ''}>
                  {inline(c, `${k}r${ri}c${i}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: React.ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(<hr key={k++} style={{ border: 0, borderTop: '1px solid var(--border)', margin: '8px 0' }} />);
      i++;
      continue;
    }
    if (line.trim().startsWith('|')) {
      const block: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) block.push(lines[i++]!.trim());
      out.push(<Table key={k++} lines={block} k={`t${k}`} />);
      continue;
    }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*([-*•]|\d+[.)])\s+/, ''));
      out.push(
        <ul key={k++} style={{ margin: '4px 0 4px 18px', padding: 0 }}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `l${k}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^#{1,4}\s+/.test(line)) {
      out.push(
        <div key={k++} style={{ fontWeight: 700, margin: '6px 0 2px' }}>
          {inline(line.replace(/^#{1,4}\s+/, ''), `h${k}`)}
        </div>,
      );
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !lines[i]!.trim().startsWith('|') && !/^\s*([-*•]|\d+[.)])\s+/.test(lines[i]!) && !/^#{1,4}\s+/.test(lines[i]!)) para.push(lines[i++]!);
    out.push(
      <p key={k++} style={{ margin: '0 0 6px' }}>
        {para.map((l, j) => (
          <span key={j}>
            {inline(l, `p${k}-${j}`)}
            {j < para.length - 1 ? <br /> : null}
          </span>
        ))}
      </p>,
    );
  }
  return <>{out}</>;
}

/** An assistant reply: markdown text with any chart blocks drawn in place. */
export function ChatAnswer({ text }: { text: string }) {
  const parts = text.split(/```chart\s*([\s\S]*?)```/g);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part.trim() ? <Markdown key={i} text={part} /> : null;
        const spec = parseChartSpec(part.trim());
        if (!spec) return null;
        return (
          <div key={i} className="chat-chart">
            {spec.title ? <div className="chat-chart-t">{spec.title}</div> : null}
            <SCChart cfg={chartCfg(spec)} style={{ height: 220 }} />
          </div>
        );
      })}
    </>
  );
}
