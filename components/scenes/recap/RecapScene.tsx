'use client';

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Thinker } from './Thinker';
import './recap.css';

interface Size {
  w: number;
  h: number;
}

interface Circle {
  cx: number;
  cy: number;
  r: number;
}

interface Cloud {
  /** Inset of the body rectangle from the bubble box. */
  m: number;
  /** Corner radius of the body rectangle. */
  rx: number;
  puffs: Circle[];
}

/** Deterministic wobble so the scallops look hand-drawn but never jump between renders. */
const WOBBLE = [1, 0.8, 1.18, 0.9, 1.08, 0.84, 1.22, 0.95, 1.04];

/** Lays out scallop circles around a rounded body so the union reads as one soft cloud. */
function buildCloud({ w, h }: Size): Cloud {
  const r = Math.max(22, Math.min(62, w * 0.06));
  const m = Math.round(r * 0.95 + 6);
  const inward = r * 0.28;
  const puffs: Circle[] = [];
  let k = 0;
  const edge = (from: number, to: number, place: (t: number) => [number, number]) => {
    const len = to - from;
    const n = Math.max(2, Math.round(len / (r * 1.7)));
    for (let i = 0; i <= n; i++) {
      const [cx, cy] = place(from + (len * i) / n);
      puffs.push({ cx, cy, r: r * WOBBLE[k++ % WOBBLE.length] });
    }
  };
  const x0 = m + r * 0.6;
  const x1 = w - m - r * 0.6;
  const y0 = m + r * 0.6;
  const y1 = h - m - r * 0.6;
  edge(x0, x1, (x) => [x, m + inward]);
  edge(y0, y1, (y) => [w - m - inward, y]);
  edge(x0, x1, (x) => [x1 + x0 - x, h - m - inward]);
  edge(y0, y1, (y) => [m + inward, y1 + y0 - y]);
  return { m, rx: r * 1.2, puffs };
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<Size | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Per-puff breathing timing: different periods and phases so the outline moves unevenly, like an amoeba. */
function puffMotion(i: number): CSSProperties {
  return {
    animationDuration: `${8 + ((i * 7) % 5) * 1.1}s`,
    animationDelay: `-${((i * 2.3) % 11).toFixed(1)}s`,
  };
}

function CloudShape({ size }: { size: Size }) {
  const id = useId().replace(/:/g, '');
  const { w, h } = size;
  const { m, rx, puffs } = buildCloud(size);
  const outline = 1.5;
  return (
    <svg
      aria-hidden
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="rcp-breathe absolute inset-0 overflow-visible"
      style={{ filter: 'drop-shadow(0 16px 26px rgba(14, 8, 36, 0.45))' }}
    >
      <defs>
        <linearGradient id={`${id}-fill`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w * 0.25} y2={h}>
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#fffaf1" />
          <stop offset="100%" stopColor="#fbefdc" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} gradientUnits="userSpaceOnUse" cx={w * 0.25} cy={h * 0.12} r={Math.max(w, h) * 0.6}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill="rgba(124, 77, 255, 0.22)">
        <rect x={m - outline} y={m - outline} width={w - 2 * m + 2 * outline} height={h - 2 * m + 2 * outline} rx={rx + outline} />
        {puffs.map((p, i) => (
          <circle key={i} className="rcp-puff" style={puffMotion(i)} cx={p.cx} cy={p.cy} r={p.r + outline} />
        ))}
      </g>
      <g fill={`url(#${id}-fill)`}>
        <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx={rx} />
        {puffs.map((p, i) => (
          <circle key={i} className="rcp-puff" style={puffMotion(i)} cx={p.cx} cy={p.cy} r={p.r} />
        ))}
      </g>
      <rect x={m} y={m} width={w - 2 * m} height={h - 2 * m} rx={rx} fill={`url(#${id}-glow)`} />
    </svg>
  );
}

const BOKEH = [
  { left: '6%', top: '8%', size: 90, color: 'rgba(255, 210, 63, 0.18)' },
  { left: '22%', top: '30%', size: 46, color: 'rgba(255, 122, 182, 0.2)' },
  { left: '74%', top: '14%', size: 120, color: 'rgba(255, 207, 128, 0.2)' },
  { left: '88%', top: '46%', size: 60, color: 'rgba(34, 195, 181, 0.16)' },
  { left: '52%', top: '6%', size: 34, color: 'rgba(255, 255, 255, 0.16)' },
  { left: '40%', top: '62%', size: 70, color: 'rgba(139, 92, 246, 0.25)' },
  { left: '12%', top: '52%', size: 28, color: 'rgba(255, 255, 255, 0.14)' },
  { left: '64%', top: '70%', size: 40, color: 'rgba(255, 210, 63, 0.14)' },
];

interface TrailPath {
  /** Start point (near the head), as CSS left/bottom in px. */
  left: number;
  bottom: number;
  /** Travel to the cloud's back edge, in px (screen axes, y down). */
  dx: number;
  dy: number;
  size: number;
}

const PHONE_TRAIL: TrailPath = { left: 80, bottom: 136, dx: 38, dy: -74, size: 18 };
const DESKTOP_TRAIL: TrailPath = { left: 186, bottom: 292, dx: 92, dy: -96, size: 28 };
/** Four bubbles a quarter cycle apart; `p` is the resting position along the path when motion is reduced (negative: hidden). */
const TRAIL = [{ p: 0.08 }, { p: 0.4 }, { p: 0.72 }, { p: -1 }];
const TRAIL_CYCLE_S = 4;

function trailStyle(path: TrailPath, i: number): CSSProperties {
  return {
    left: path.left,
    bottom: path.bottom,
    width: path.size,
    height: path.size,
    animationDelay: `-${(i * TRAIL_CYCLE_S) / TRAIL.length}s`,
    animationDuration: `${TRAIL_CYCLE_S}s`,
    ['--dx' as string]: `${path.dx}px`,
    ['--dy' as string]: `${path.dy}px`,
    ['--p' as string]: TRAIL[i].p,
  };
}

/** Softly lit evening room: an attendee bottom-left thinks a round recap bubble. */
export function RecapScene({ children }: { children: ReactNode }) {
  const [bubbleRef, bubbleSize] = useSize<HTMLDivElement>();
  const cloud = bubbleSize ? buildCloud(bubbleSize) : null;
  const pad = cloud ? cloud.m + 6 : 40;

  return (
    <div className="rcp-root relative w-full overflow-hidden">
      {BOKEH.map((b, i) => (
        <span
          key={i}
          aria-hidden
          className="rcp-bokeh"
          style={{
            left: b.left,
            top: b.top,
            width: b.size,
            height: b.size,
            background: `radial-gradient(circle at 40% 35%, ${b.color}, transparent 72%)`,
          }}
        />
      ))}
      <div aria-hidden className="rcp-floor absolute inset-x-0 bottom-0 h-12 sm:h-16" />

      <div className="relative mx-auto w-full max-w-[1080px]" style={{ height: 'calc(100svh - 4rem)', minHeight: 560 }}>
        <Thinker className="absolute bottom-3 left-2 h-auto w-[104px] sm:bottom-5 sm:left-6 sm:w-[230px]" />

        {/* Thought trail: a train of small bubbles rising from the head into the back of the cloud */}
        {TRAIL.map((t, i) => (
          <span key={`p${i}`} aria-hidden className={`rcp-trail sm:hidden ${t.p < 0 ? 'rcp-trail--extra' : ''}`} style={trailStyle(PHONE_TRAIL, i)} />
        ))}
        {TRAIL.map((t, i) => (
          <span key={`d${i}`} aria-hidden className={`rcp-trail hidden sm:block ${t.p < 0 ? 'rcp-trail--extra' : ''}`} style={trailStyle(DESKTOP_TRAIL, i)} />
        ))}

        {/* Bubble */}
        <div
          ref={bubbleRef}
          className="z-10 absolute left-1 right-1 top-2 bottom-[196px] sm:left-[250px] sm:right-4 sm:top-4 sm:bottom-10"
        >
          {bubbleSize && (
            <div aria-hidden className="rcp-float absolute inset-0">
              <CloudShape size={bubbleSize} />
            </div>
          )}
          <div className="rcp-scroll rcp-fade absolute overflow-y-auto overscroll-contain px-2 py-2 sm:px-4" style={{ inset: pad }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
