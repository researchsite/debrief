'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import type { CouponData } from '@/lib/graph-writes';
import { useSceneProgress } from '@/components/pixel';
import { LeafLining, WalletPage, type PageContext, type PageSpec, type SpineSide, type WalletStatus } from './WalletPages';

export type { WalletStatus } from './WalletPages';

const WIDE_QUERY = '(min-width: 640px)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';
/** Blank card-slot pages shown only when the wallet is empty. */
const BLANK_PAGES = 2;
/** When coupons exist, content starts on page index 1 (right after the cover). */
const FIRST_CONTENT_PAGE = 1;
/** Progress units per pixel of wheel delta; ~330px of scroll turns one page. */
const SENSITIVITY = 0.003;
/** Fraction of a page a gesture must move to commit to the next page. */
const COMMIT = 0.12;

function useMedia(query: string, server: boolean): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => server,
  );
}

export interface WalletSceneProps {
  status: WalletStatus;
  items: CouponData[];
  /** Current search text; a new query jumps to the first coupon page. */
  query: string;
  eventName: string | null;
  copiedCode: string | null;
  onCopy: (code: string) => void;
  onMarkUsed: (code: string) => void;
  onUpdate: (code: string, patch: { vendor?: string; value?: string; description?: string; expires?: string | null }) => Promise<void>;
  onRetry: () => void;
}

const SHADE = 'rgba(27,21,48,0.6)';

/**
 * An open pixel-art wallet whose leaves turn around the spine. Vertical scroll
 * or swipe scrubs the turn continuously; it settles on the nearest page.
 * Wide screens show a two-page spread, phones one page at a time.
 */
export function WalletScene({
  status,
  items,
  query,
  eventName,
  copiedCode,
  onCopy,
  onMarkUsed,
  onUpdate,
  onRetry,
}: WalletSceneProps) {
  const wide = useMedia(WIDE_QUERY, true);
  const reduced = useMedia(REDUCED_QUERY, false);

  const pages = useMemo<PageSpec[]>(() => {
    const list: PageSpec[] = [{ kind: 'cover' }];
    if (status === 'ready' && items.length > 0) {
      // Slots filled — go straight to coupons after the cover, no blank pages needed.
      for (const coupon of items) list.push({ kind: 'coupon', coupon });
    } else {
      // Empty wallet: show decorative card-slot pages, then the empty/error message.
      for (let i = 0; i < BLANK_PAGES; i++) list.push({ kind: 'slots', key: `slots-${i}` });
      list.push({ kind: 'message' });
    }
    return list;
  }, [status, items]);

  // Wide screens pair pages into spreads; pad with a blank back pocket.
  const spreadPages = useMemo<PageSpec[]>(
    () => (pages.length % 2 === 0 ? pages : [...pages, { kind: 'slots', key: 'slots-back' }]),
    [pages],
  );
  const stops = wide ? spreadPages.length / 2 : pages.length;

  const { ref, value, target, setTarget } = useSceneProgress<HTMLDivElement>({
    min: 0,
    max: stops - 1,
    sensitivity: SENSITIVITY,
    damping: 0.1,
  });

  // Directional snap: once input pauses, commit to the page the gesture was heading for.
  const restRef = useRef(0);
  const settle = useCallback(() => {
    setTarget((prev) => {
      const base = Math.floor(prev);
      const frac = prev - base;
      const dir = Math.sign(prev - restRef.current);
      let next: number;
      if (dir > 0) next = frac > COMMIT ? base + 1 : base;
      else if (dir < 0) next = frac < 1 - COMMIT ? base : base + 1;
      else next = Math.round(prev);
      next = Math.min(stops - 1, Math.max(0, next));
      restRef.current = next;
      return next;
    });
  }, [setTarget, stops]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, ms);
    };
    const onWheel = () => schedule(160);
    const onTouchEnd = () => schedule(40);
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchend', onTouchEnd);
      if (timer) clearTimeout(timer);
    };
  }, [ref, settle]);

  const goTo = useCallback(
    (stop: number) => {
      const next = Math.min(stops - 1, Math.max(0, stop));
      restRef.current = next;
      setTarget(next);
    },
    [setTarget, stops],
  );
  const step = useCallback((dir: 1 | -1) => goTo(Math.round(restRef.current) + dir), [goTo]);

  // Keep the same page in view when the layout switches between spread and single page.
  const prevWide = useRef(wide);
  useEffect(() => {
    if (prevWide.current === wide) return;
    prevWide.current = wide;
    const cur = restRef.current;
    goTo(wide ? Math.floor(cur / 2) : cur * 2);
  }, [wide, goTo]);

  // A new search jumps to the first coupon page.
  const prevQuery = useRef(query);
  useEffect(() => {
    if (prevQuery.current === query) return;
    prevQuery.current = query;
    goTo(wide ? Math.floor(FIRST_CONTENT_PAGE / 2) : FIRST_CONTENT_PAGE);
  }, [query, wide, goTo]);

  // Keyboard arrows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const ctx: PageContext = {
    status,
    count: items.length,
    filtered: query.trim().length > 0,
    eventName,
    copiedCode,
    onCopy,
    onMarkUsed,
    onUpdate,
    onRetry,
  };

  const shown = Math.min(stops - 1, Math.max(0, reduced ? Math.round(target) : value));
  let base = Math.floor(shown);
  let frac = shown - base;
  if (frac < 0.002) frac = 0;
  else if (frac > 0.998) {
    base += 1;
    frac = 0;
  }
  const turning = frac > 0;
  const angle = frac * 180;
  // Leaf darkens as it approaches edge-on (90deg); the page underneath gets the leaf's shadow.
  const frontShade = Math.min(1, angle / 90) * 0.85;
  const backShade = Math.min(1, (180 - angle) / 90) * 0.85;
  const castShadow = Math.sin(frac * Math.PI) * 0.7;
  const current = Math.min(stops - 1, Math.round(target));

  const page = (i: number, spine: SpineSide) => {
    const list = wide ? spreadPages : pages;
    const spec = list[i];
    if (!spec) return null;
    return <WalletPage spec={spec} spine={spine} ctx={ctx} />;
  };

  const leafStyle: CSSProperties = {
    transform: `rotateY(${-angle}deg)`,
    transformOrigin: 'left center',
    transformStyle: 'preserve-3d',
    willChange: 'transform',
  };
  const face: CSSProperties = { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
      <div
        ref={ref}
        className="relative w-full max-w-[900px] min-h-0 flex-1 touch-none select-none sm:max-h-[620px]"
        style={{ perspective: wide ? '2800px' : '1800px' }}
        aria-roledescription="wallet"
      >
        {/* Wallet leather backing */}
        <div
          className="absolute inset-0 border-4 border-[#1b1530]"
          style={{ background: '#7a4f2c', boxShadow: '8px 8px 0 0 #1b1530' }}
        />

        {wide ? (
          <div className="absolute inset-2" style={{ transformStyle: 'preserve-3d' }}>
            {/* Static left page: the left of this spread until the leaf lands on it. */}
            <div className="absolute inset-y-0 left-0 w-1/2">
              {page(base * 2, 'right')}
              <Shadow side="right" opacity={turning && frac > 0.5 ? castShadow : 0} />
            </div>
            {/* Static right page: what the turning leaf reveals. */}
            <div className="absolute inset-y-0 right-0 w-1/2">
              {page(turning ? base * 2 + 3 : base * 2 + 1, 'left')}
              <Shadow side="left" opacity={turning && frac <= 0.5 ? castShadow : 0} />
            </div>
            {turning && (
              <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-1/2" style={leafStyle}>
                <div className="absolute inset-0" style={face}>
                  {page(base * 2 + 1, 'left')}
                  <Shade side="right" opacity={frontShade} />
                </div>
                <div className="absolute inset-0" style={{ ...face, transform: 'rotateY(180deg)' }}>
                  {page(base * 2 + 2, 'right')}
                  <Shade side="left" opacity={backShade} />
                </div>
              </div>
            )}
            {/* Spine */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-1/2 z-30 w-3 -translate-x-1/2"
              style={{ background: '#5a381c', borderLeft: '2px solid #1b1530', borderRight: '2px solid #1b1530' }}
            />
          </div>
        ) : (
          <div className="absolute inset-2 overflow-hidden" style={{ transformStyle: 'preserve-3d' }}>
            <div className="absolute inset-0 pl-2">
              <div className="relative h-full w-full">
                {page(turning ? base + 1 : base, 'left')}
                <Shadow side="left" opacity={turning ? castShadow : 0} />
              </div>
            </div>
            {turning && (
              <div className="pointer-events-none absolute inset-y-0 right-0 left-2 z-20" style={leafStyle}>
                <div className="absolute inset-0" style={face}>
                  {page(base, 'left')}
                  <Shade side="right" opacity={frontShade} />
                </div>
                <div className="absolute inset-0" style={{ ...face, transform: 'rotateY(180deg)' }}>
                  <LeafLining />
                  <Shade side="left" opacity={backShade} />
                </div>
              </div>
            )}
            {/* Binding along the left edge */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-30 w-2"
              style={{ background: '#5a381c', borderRight: '2px solid #1b1530' }}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="px-btn font-pixel !px-3 !py-1 text-lg"
          onClick={() => step(-1)}
          disabled={current <= 0}
          aria-label={wide ? 'Previous spread' : 'Previous page'}
        >
          ◀
        </button>
        <span className="font-pixel min-w-[4.5rem] text-center text-lg text-[#1b1530]" aria-live="polite">
          {current + 1} / {stops}
        </span>
        <button
          type="button"
          className="px-btn font-pixel !px-3 !py-1 text-lg"
          onClick={() => step(1)}
          disabled={current >= stops - 1}
          aria-label={wide ? 'Next spread' : 'Next page'}
        >
          ▶
        </button>
      </div>
    </div>
  );
}

/** Darkening gradient on a turning face, heaviest on its free edge. */
function Shade({ side, opacity }: { side: 'left' | 'right'; opacity: number }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        opacity,
        background: `linear-gradient(to ${side}, rgba(27,21,48,0.1), ${SHADE})`,
      }}
    />
  );
}

/** Soft shadow the lifted leaf casts on the page beneath, strongest at the spine. */
function Shadow({ side, opacity }: { side: 'left' | 'right'; opacity: number }) {
  if (opacity <= 0) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        opacity,
        background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, ${SHADE}, rgba(27,21,48,0) 65%)`,
      }}
    />
  );
}
