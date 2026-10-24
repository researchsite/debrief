'use client';

import { useEffect, useRef } from 'react';
import { paintAtrium } from './atrium';
import styles from './styles';

/** Breakpoint (CSS px) between the portrait phone layout and the wide layout; mirrors calendar.css. */
const WIDE_MIN = 768;
/** Approximate half-width (CSS px) of the end-of-hall sign plus a margin. */
const SIGN_CLEARANCE = 112;

/**
 * Static convention-center atrium behind the schedule board. Painted once per
 * size onto a low-resolution canvas and scaled up with crisp pixels; the
 * picture is deterministic, so nothing here differs between server and client.
 */
export function HallBackdrop() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let painted = '';

    const paint = () => {
      const { clientWidth: cw, clientHeight: ch } = host;
      if (cw === 0 || ch === 0) return;
      const wide = cw >= WIDE_MIN;
      const scale = wide ? 4 : 3;
      const w = Math.ceil(cw / scale);
      const h = Math.ceil(ch / scale);
      const key = `${w}x${h}`;
      if (key === painted) return;
      painted = key;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w * scale}px`;
      canvas.style.height = `${h * scale}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      // Wide: the board hangs left of centre, so the vanishing point (and the
      // DEVCONF sign drawn there) moves right far enough to clear the truss.
      const vpX = Math.min(0.74, Math.max(0.64, 0.575 + SIGN_CLEARANCE / cw));
      paintAtrium(ctx, w, h, wide ? { vpX, vpY: 0.17, spread: 0.47 } : { vpY: 0.7, spread: 0.55 });
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={hostRef} aria-hidden className={styles.hall}>
      <canvas ref={canvasRef} className={styles.hallCanvas} />
    </div>
  );
}
