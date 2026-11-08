import { useEffect, useRef, useState, type ReactNode } from 'react';

/* Chart tokens (dark surface). Series hues follow a fixed, validated order. */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9'];
export const DEEMPH = '#4a4945';
const SURFACE = '#1a1a19';
const GRID = '#2c2c2a';
const AXIS = '#383835';
const MUTED = '#8f8d86';

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(Math.max(200, el.clientWidth));
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Clean tick values covering [min, max]. */
export function niceTicks(min: number, max: number, count = 4, minStep = 0): number[] {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  }
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = Math.max(minStep, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

const defaultFmt = (v: number) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}K` : String(Math.round(v * 10) / 10));

/* ------------------------------------------------------------------ */
/* Line chart                                                          */
/* ------------------------------------------------------------------ */

export interface LinePoint {
  x: number;
  y: number | null;
  tip?: string;
}

export interface LineSeries {
  id: string;
  label: string;
  color: string;
  points: LinePoint[];
}

export function LineChart({
  series,
  height = 180,
  xFormat,
  yFormat = defaultFmt,
  yMin,
  yMax,
  empty = 'Not enough data yet.',
  minPoints = 2,
  endLabel = true,
  integer = false,
  title,
}: {
  series: LineSeries[];
  /** Ticks on whole numbers only (e.g. grades, counts) */
  integer?: boolean;
  height?: number;
  xFormat: (x: number) => string;
  yFormat?: (y: number) => string;
  yMin?: number;
  yMax?: number;
  empty?: ReactNode;
  minPoints?: number;
  endLabel?: boolean;
  title?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points.filter((p) => p.y != null));
  if (all.length < minPoints) {
    return (
      <div className="chart-empty" ref={ref}>
        {empty}
      </div>
    );
  }
  const xs = Array.from(new Set(all.map((p) => p.x))).sort((a, b) => a - b);
  const ys = all.map((p) => p.y as number);
  const ticks = niceTicks(yMin ?? Math.min(...ys), yMax ?? Math.max(...ys), 4, integer ? 1 : 0);
  const y0 = ticks[0];
  const y1 = ticks[ticks.length - 1];
  const tickW = Math.max(...ticks.map((t) => yFormat(t).length)) * 7 + 10;
  const pad = { l: tickW, r: endLabel ? 40 : 12, t: 12, b: 24 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const xMin = xs[0];
  const xMax = xs[xs.length - 1];
  const sx = (x: number) => pad.l + (xMax === xMin ? iw / 2 : ((x - xMin) / (xMax - xMin)) * iw);
  const sy = (y: number) => pad.t + ih - ((y - y0) / (y1 - y0 || 1)) * ih;

  const xTickCount = Math.min(xs.length, Math.max(2, Math.floor(iw / 70)));
  const xTicks = xs.length <= xTickCount ? xs : Array.from({ length: xTickCount }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (xTickCount - 1))]);

  const onPointer = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    let best = xs[0];
    for (const x of xs) if (Math.abs(sx(x) - px) < Math.abs(sx(best) - px)) best = x;
    setHover(best);
  };

  const hoverRows =
    hover == null
      ? []
      : series
          .map((s) => ({ s, p: s.points.find((p) => p.x === hover && p.y != null) }))
          .filter((r) => !!r.p);
  const tipLeft = hover == null ? 0 : Math.min(Math.max(sx(hover) - 70, 0), width - 150);

  return (
    <div>
      {series.length > 1 && (
        <div className="legend">
          {series.map((s) => (
            <span key={s.id}>
              <i style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div
        className="chart"
        ref={ref}
        onPointerDown={(e) => onPointer(e.clientX)}
        onPointerMove={(e) => (e.pointerType === 'mouse' || e.buttons) && onPointer(e.clientX)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        role="img"
        aria-label={title ?? series.map((s) => s.label).join(', ')}
      >
        <svg width={width} height={height}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke={t === y0 ? AXIS : GRID} strokeWidth={1} />
              <text x={pad.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {yFormat(t)}
              </text>
            </g>
          ))}
          {xTicks.map((x, i) => (
            <text
              key={x}
              x={sx(x)}
              y={height - 6}
              textAnchor={xTicks.length > 1 && i === 0 ? 'start' : i === xTicks.length - 1 && xTicks.length > 1 ? 'end' : 'middle'}
              fontSize={11}
              fill={MUTED}
            >
              {xFormat(x)}
            </text>
          ))}
          {hover != null && <line x1={sx(hover)} x2={sx(hover)} y1={pad.t} y2={pad.t + ih} stroke="#55544f" strokeWidth={1} />}
          {series.map((s) => {
            const pts = s.points.filter((p) => p.y != null).sort((a, b) => a.x - b.x);
            let d = '';
            pts.forEach((p, i) => (d += `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y!).toFixed(1)}`));
            const showMarkers = pts.length <= 24;
            const last = pts[pts.length - 1];
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, i) =>
                  showMarkers || i === pts.length - 1 || p.x === hover ? (
                    <circle key={i} cx={sx(p.x)} cy={sy(p.y!)} r={p.x === hover ? 5 : 4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
                  ) : null,
                )}
                {endLabel && last && series.length <= 2 && (
                  <text x={sx(last.x) + 8} y={sy(last.y!)} dy="0.32em" fontSize={11.5} fill="#c3c2b7" fontWeight={600}>
                    {yFormat(last.y!)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hover != null && hoverRows.length > 0 && (
          <div className="chart-tip" style={{ left: tipLeft }}>
            <div className="tip-title">{xFormat(hover)}</div>
            {hoverRows.map(({ s, p }) => (
              <div className="tip-row" key={s.id}>
                <span className="dot" style={{ background: s.color, width: 8, height: 8 }} />
                {series.length > 1 ? `${s.label}: ` : ''}
                {p!.tip ?? yFormat(p!.y!)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Column chart (optionally stacked)                                   */
/* ------------------------------------------------------------------ */

export interface BarSegment {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface BarDatum {
  key: string;
  label: string;
  title?: string;
  segments: BarSegment[];
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function BarChart({
  data,
  height = 170,
  yFormat = defaultFmt,
  empty = 'No data yet.',
  legend,
  title,
}: {
  data: BarDatum[];
  height?: number;
  yFormat?: (y: number) => string;
  empty?: ReactNode;
  legend?: Array<{ label: string; color: string }>;
  title?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const totals = data.map((d) => d.segments.reduce((a, s) => a + s.value, 0));
  if (!data.length || totals.every((t) => t === 0)) {
    return (
      <div className="chart-empty" ref={ref}>
        {empty}
      </div>
    );
  }
  const ticks = niceTicks(0, Math.max(...totals), 4);
  const top = ticks[ticks.length - 1];
  const tickW = Math.max(...ticks.map((t) => yFormat(t).length)) * 7 + 10;
  const pad = { l: tickW, r: 6, t: 10, b: 24 };
  const iw = width - pad.l - pad.r;
  const ih = height - pad.t - pad.b;
  const band = iw / data.length;
  const bw = Math.min(24, Math.max(4, band * 0.62));
  const sy = (v: number) => pad.t + ih - (v / (top || 1)) * ih;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(1, Math.floor(iw / 44))));
  const hovered = data.find((d) => d.key === hover);
  const hi = hovered ? data.indexOf(hovered) : -1;
  const tipLeft = hi < 0 ? 0 : Math.min(Math.max(pad.l + band * hi + band / 2 - 70, 0), width - 160);

  return (
    <div>
      {legend && legend.length > 1 && (
        <div className="legend">
          {legend.map((l) => (
            <span key={l.label}>
              <i className="sq" style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      <div className="chart" ref={ref} role="img" aria-label={title}>
        <svg width={width} height={height}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={sy(t)} y2={sy(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} />
              <text x={pad.l - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED}>
                {yFormat(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.l + band * i + (band - bw) / 2;
            let acc = 0;
            const segs = d.segments.filter((s) => s.value > 0);
            return (
              <g key={d.key} onPointerDown={() => setHover(hover === d.key ? null : d.key)} onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(d.key)} onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}>
                <rect x={pad.l + band * i} y={pad.t} width={band} height={ih} fill="transparent" />
                {segs.map((s, si) => {
                  const y = sy(acc + s.value);
                  const h = sy(acc) - y;
                  acc += s.value;
                  const isTop = si === segs.length - 1;
                  // 2px surface gap between stacked segments
                  const hh = Math.max(0, h - (si > 0 ? 2 : 0));
                  return isTop ? (
                    <path key={s.id} d={roundedTop(x, y, bw, hh, 4)} fill={s.color} opacity={hover && hover !== d.key ? 0.55 : 1} />
                  ) : (
                    <rect key={s.id} x={x} y={y} width={bw} height={hh} fill={s.color} opacity={hover && hover !== d.key ? 0.55 : 1} />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text x={x + bw / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={MUTED}>
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div className="chart-tip" style={{ left: tipLeft }}>
            <div className="tip-title">{hovered.title ?? hovered.label}</div>
            {hovered.segments.map((s) => (
              <div className="tip-row" key={s.id}>
                <span className="dot" style={{ background: s.color, width: 8, height: 8 }} />
                {s.label}: {yFormat(s.value)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bars (e.g. grade pyramid)                                */
/* ------------------------------------------------------------------ */

export function HBars({ rows, color = SERIES[0], format = (v: number) => String(v), labelWidth = 34 }: { rows: Array<{ label: string; value: number; note?: string }>; color?: string; format?: (v: number) => string; labelWidth?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      {rows.map((r) => (
        <div key={r.label} className="row" style={{ marginBottom: 6 }}>
          <span className="tabular small text-2" style={{ width: labelWidth, flex: 'none', textAlign: 'right' }}>
            {r.label}
          </span>
          <div className="grow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {r.value > 0 && <span style={{ height: 14, width: `${(r.value / max) * 85}%`, minWidth: 4, background: color, borderRadius: '0 4px 4px 0' }} />}
            <span className="xsmall tabular text-2">
              {format(r.value)}
              {r.note ? <span className="muted"> {r.note}</span> : null}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
