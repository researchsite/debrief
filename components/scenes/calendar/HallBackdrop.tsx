'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { paintAtrium, type BoardRect } from './atrium';
import styles from './styles';

/** Breakpoint (CSS px) between the portrait phone layout and the wide layout; mirrors calendar.css. */
const WIDE_MIN = 768;
const FALLBACK_FONT = 'ui-sans-serif, system-ui, sans-serif';

/**
 * Static convention-center atrium behind the schedule board, painted once per
 * size at full device resolution. The truss, cables and the clearing on the
 * floor are fitted to the board's measured rectangle. The picture is
 * deterministic and painted only on the client, so nothing differs between
 * server and client renders.
 */
export function HallBackdrop({ boardRef }: { boardRef: RefObject<HTMLElement | null> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    let painted = '';
    let cancelled = false;

    const paint = (force = false) => {
      const { clientWidth: cw, clientHeight: ch } = host;
      if (cw === 0 || ch === 0) return;
      const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      const hostBox = host.getBoundingClientRect();
      const el = boardRef.current;
      let board: BoardRect | null = null;
      if (el) {
        const b = el.getBoundingClientRect();
        board = {
          left: b.left - hostBox.left,
          top: b.top - hostBox.top,
          right: b.right - hostBox.left,
          bottom: b.bottom - hostBox.top,
        };
      }
      const key = `${cw}x${ch}@${dpr}|${board ? Object.values(board).map(Math.round).join(',') : '-'}`;
      if (key === painted && !force) return;
      painted = key;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      canvas.style.width = `${cw}px`;
      canvas.style.height = `${ch}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const font = getComputedStyle(host).getPropertyValue('--font-geist-sans').trim() || FALLBACK_FONT;
      paintAtrium(ctx, cw, ch, { wide: cw >= WIDE_MIN, board, font: `${font}, ${FALLBACK_FONT}` });
    };

    paint();
    // Repaint once the web font is ready so the painted signage uses it.
    document.fonts?.ready.then(() => {
      if (!cancelled) paint(true);
    });
    const ro = new ResizeObserver(() => paint());
    ro.observe(host);
    if (boardRef.current) ro.observe(boardRef.current);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [boardRef]);

  return (
    <div ref={hostRef} aria-hidden className={styles.hall}>
      <canvas ref={canvasRef} className={styles.hallCanvas} />
    </div>
  );
}
