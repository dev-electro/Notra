import { useState } from 'react';
import { fmtNum } from '../lib/format';

/** Hand-rolled SVG charts (no chart dependency). Values may be null (no data) or "<5" (hidden small group): both are drawn as gaps. */
export type Pt = number | string | null | undefined;
const num = (v: Pt): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const W = 640;
const H = 220;
const M = { l: 44, r: 12, t: 12, b: 28 };

function niceMax(max: number): number {
  if (max <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(max));
  const n = max / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function Axes({ max, labels, xAt }: { max: number; labels: string[]; xAt: (i: number) => number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const step = Math.max(1, Math.ceil(labels.length / 6));
  return (
    <g fontSize="10" fill="var(--muted)">
      {ticks.map((t) => {
        const y = M.t + (H - M.t - M.b) * (1 - t / max);
        return (
          <g key={t}>
            <line x1={M.l} x2={W - M.r} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />
            <text x={M.l - 6} y={y + 3} textAnchor="end">{fmtNum(Math.round(t * 10) / 10)}</text>
          </g>
        );
      })}
      {labels.map((l, i) => (i % step === 0 ? <text key={i} x={xAt(i)} y={H - 8} textAnchor="middle">{l}</text> : null))}
    </g>
  );
}

export function LineChart({ labels, series, label }: { labels: string[]; series: { name: string; values: Pt[]; color?: string }[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.map(num)).filter((v): v is number => v !== null);
  const max = niceMax(Math.max(0, ...all));
  const n = Math.max(1, labels.length - 1);
  const xAt = (i: number) => M.l + ((W - M.l - M.r) * i) / n;
  const yAt = (v: number) => M.t + (H - M.t - M.b) * (1 - v / max);
  const hidden = series.some((s) => s.values.includes('<5'));
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full" onMouseLeave={() => setHover(null)}>
        <Axes max={max} labels={labels} xAt={xAt} />
        {series.map((s, si) => {
          const color = s.color ?? ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'][si % 3]!;
          let d = '';
          let pen = false;
          s.values.forEach((raw, i) => {
            const v = num(raw);
            if (v === null) { pen = false; return; }
            d += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)} `;
            pen = true;
          });
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((raw, i) => { const v = num(raw); return v !== null && labels.length <= 40 ? <circle key={i} cx={xAt(i)} cy={yAt(v)} r="2.5" fill={color} /> : null; })}
            </g>
          );
        })}
        {labels.map((_, i) => (
          <rect key={i} x={xAt(i) - (W - M.l - M.r) / n / 2} y={M.t} width={(W - M.l - M.r) / n} height={H - M.t - M.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
        {hover !== null && <line x1={xAt(hover)} x2={xAt(hover)} y1={M.t} y2={H - M.b} stroke="var(--muted)" strokeDasharray="3 3" />}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {series.map((s, si) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-3 rounded-sm" style={{ background: s.color ?? ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)'][si % 3] }} />
            {s.name}
          </span>
        ))}
        {hover !== null && <span className="text-ink">{labels[hover]}: {series.map((s) => `${s.name} ${fmtNum(s.values[hover] as number | string | null)}`).join(' · ')}</span>}
        {hidden && <span>Gaps = fewer than 5 users (hidden).</span>}
      </figcaption>
    </figure>
  );
}

export function BarChart({ labels, values, label, color = 'var(--chart-1)' }: { labels: string[]; values: Pt[]; label: string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const nums = values.map(num);
  const max = niceMax(Math.max(0, ...nums.filter((v): v is number => v !== null)));
  const slot = (W - M.l - M.r) / Math.max(1, labels.length);
  const xAt = (i: number) => M.l + slot * i + slot / 2;
  const hidden = values.includes('<5');
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full" onMouseLeave={() => setHover(null)}>
        <Axes max={max} labels={labels} xAt={xAt} />
        {nums.map((v, i) => {
          const h = v === null ? 0 : (H - M.t - M.b) * (v / max);
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={xAt(i) - slot * 0.35} y={H - M.b - h} width={slot * 0.7} height={Math.max(h, v === null ? 0 : 1)} rx="2" fill={color} opacity={hover === null || hover === i ? 1 : 0.55} />
              {v === null && values[i] === '<5' && <text x={xAt(i)} y={H - M.b - 4} fontSize="10" textAnchor="middle" fill="var(--muted)">&lt;5</text>}
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">
        {hover !== null ? <span className="text-ink">{labels[hover]}: {fmtNum(values[hover] as number | string | null)}</span> : <span>{label}</span>}
        {hidden && <span> · “&lt;5” = fewer than 5 users, hidden.</span>}
      </figcaption>
    </figure>
  );
}
