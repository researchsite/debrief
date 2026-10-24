'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SceneProgressOptions {
  /** Lowest allowed target value. */
  min?: number;
  /** Highest allowed target value. */
  max?: number;
  /** Units added per pixel of wheel delta / touch drag. */
  sensitivity?: number;
  /** When set, the target snaps to a multiple of this after input settles. */
  snap?: number;
  /** Fraction of the remaining distance covered per 60fps frame (0..1). */
  damping?: number;
  /** Use horizontal touch drag instead of vertical. */
  horizontalTouch?: boolean;
}

/**
 * Turns wheel and touch-drag input on an element into a smoothly eased value.
 * `value` is eased every animation frame toward `target`; `setTarget` lets
 * buttons and keyboard handlers drive the same value.
 */
export function useSceneProgress<T extends HTMLElement = HTMLDivElement>({
  min = 0,
  max = 1,
  sensitivity = 0.001,
  snap,
  damping = 0.12,
  horizontalTouch = false,
}: SceneProgressOptions = {}) {
  const ref = useRef<T | null>(null);
  const target = useRef(min);
  const current = useRef(min);
  const [value, setValue] = useState(min);
  const [settledTarget, setSettledTarget] = useState(min);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clamp = useCallback((v: number) => Math.min(max, Math.max(min, v)), [min, max]);

  const commit = useCallback(
    (v: number) => {
      target.current = clamp(v);
      setSettledTarget(target.current);
    },
    [clamp],
  );

  const scheduleSnap = useCallback(() => {
    if (!snap) return;
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      commit(Math.round(target.current / snap) * snap);
    }, 140);
  }, [snap, commit]);

  const setTarget = useCallback(
    (v: number | ((prev: number) => number)) => {
      const next = typeof v === 'function' ? v(target.current) : v;
      commit(snap ? Math.round(next / snap) * snap : next);
    },
    [commit, snap],
  );

  useEffect(() => {
    target.current = clamp(target.current);
    current.current = clamp(current.current);
  }, [clamp]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 16.667;
      last = now;
      const diff = target.current - current.current;
      if (Math.abs(diff) > 0.0005) {
        current.current += diff * (1 - Math.pow(1 - damping, dt));
        setValue(current.current);
      } else if (current.current !== target.current) {
        current.current = target.current;
        setValue(current.current);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [damping]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let touchStart = 0;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      commit(target.current + delta * sensitivity);
      scheduleSnap();
    };
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStart = horizontalTouch ? t.clientX : t.clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const t = e.touches[0];
      const pos = horizontalTouch ? t.clientX : t.clientY;
      commit(target.current + (touchStart - pos) * sensitivity * 2);
      touchStart = pos;
    };
    const onTouchEnd = () => scheduleSnap();

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      if (snapTimer.current) clearTimeout(snapTimer.current);
    };
  }, [commit, scheduleSnap, sensitivity, horizontalTouch]);

  return { ref, value, target: settledTarget, setTarget };
}
