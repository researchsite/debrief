'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import type { CouponData } from '@/lib/graph-writes';
import { PX, PixelSprite } from '@/components/pixel';
import { CouponTicket } from './CouponTicket';

const TURN_MS = 450;
const WIDE_QUERY = '(min-width: 640px)';

function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => true,
  );
}

const COIN = [
  '..kkkk..',
  '.kyyyyk.',
  'kyywyyyk',
  'kywyyoyk',
  'kyyyyoyk',
  'kyyyooyk',
  '.kyooyk.',
  '..kkkk..',
];
const COIN_PALETTE = { k: PX.ink, y: PX.sun, w: PX.white, o: PX.orange };

export type WalletStatus = 'loading' | 'error' | 'ready';

export interface WalletSceneProps {
  status: WalletStatus;
  items: CouponData[];
  filtered: boolean;
  copiedCode: string | null;
  onCopy: (code: string) => void;
  onMarkUsed: (code: string) => void;
  onRetry: () => void;
}

type Side = 'a' | 'b';

/** An open pixel-art bifold wallet; each spread holds two tickets and pages turn around the spine. */
export function WalletScene({ status, items, filtered, copiedCode, onCopy, onMarkUsed, onRetry }: WalletSceneProps) {
  const wide = useWide();
  const spreadCount = Math.max(1, Math.ceil(items.length / 2));
  const [rawSpread, setSpread] = useState(0);
  const spread = Math.min(rawSpread, spreadCount - 1);
  const [turn, setTurn] = useState<1 | -1 | null>(null);
  const leafRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const turnRef = useRef(turn);
  const lastFlip = useRef(0);

  useEffect(() => {
    turnRef.current = turn;
  }, [turn]);

  const flip = useCallback(
    (dir: 1 | -1) => {
      if (turnRef.current !== null) return;
      const next = spread + dir;
      if (next < 0 || next >= spreadCount) return;
      lastFlip.current = Date.now();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setSpread(next);
        return;
      }
      turnRef.current = dir;
      setTurn(dir);
    },
    [spread, spreadCount],
  );

  // Run the page-turn animation whenever a turn starts.
  useEffect(() => {
    const el = leafRef.current;
    if (turn === null || !el) return;
    const axis = wide ? 'rotateY' : 'rotateX';
    const end = wide ? (turn === 1 ? -180 : 180) : turn === 1 ? 180 : -180;
    const anim = el.animate(
      [{ transform: `${axis}(0deg)` }, { transform: `${axis}(${end}deg)` }],
      { duration: TURN_MS, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' },
    );
    let cancelled = false;
    anim.finished
      .then(() => {
        if (cancelled) return;
        setSpread((s) => s + turn);
        setTurn(null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      anim.cancel();
    };
  }, [turn, wide]);

  // Keyboard arrows.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        flip(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        flip(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flip]);

  // Wheel and swipe: one flip per gesture.
  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    let acc = 0;
    let accTimer: ReturnType<typeof setTimeout> | null = null;
    let startX = 0;
    let startY = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (Date.now() - lastFlip.current < TURN_MS + 250) return;
      acc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (accTimer) clearTimeout(accTimer);
      accTimer = setTimeout(() => (acc = 0), 200);
      if (Math.abs(acc) > 40) {
        flip(acc > 0 ? 1 : -1);
        acc = 0;
      }
    };
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      const dx = startX - t.clientX;
      const dy = startY - t.clientY;
      const d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (Math.abs(d) > 45) flip(d > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
      if (accTimer) clearTimeout(accTimer);
    };
  }, [flip]);

  const at = (i: number): CouponData | undefined => items[i];
  const cur = spread * 2;

  let underA = at(cur);
  let underB = at(cur + 1);
  let leafFront: { item?: CouponData; side: Side } | null = null;
  let leafBack: { item?: CouponData; side: Side } | null = null;
  if (turn === 1) {
    underB = at(cur + 3);
    leafFront = { item: at(cur + 1), side: 'b' };
    leafBack = { item: at(cur + 2), side: 'a' };
  } else if (turn === -1) {
    underA = at(cur - 2);
    leafFront = { item: at(cur), side: 'a' };
    leafBack = { item: at(cur - 1), side: 'b' };
  }

  const renderItem = (item: CouponData | undefined, side: Side): ReactNode => {
    if (status === 'loading') {
      return side === 'a' ? <LoadingCard /> : <EmptySlot />;
    }
    if (status === 'error') {
      return side === 'a' ? <ErrorCard onRetry={onRetry} /> : <EmptySlot />;
    }
    if (items.length === 0) {
      return side === 'a' ? <EmptySlot sprite /> : <EmptyCard filtered={filtered} />;
    }
    if (!item) return <EmptySlot />;
    return (
      <CouponTicket
        coupon={item}
        copied={copiedCode === item.code}
        onCopy={onCopy}
        onMarkUsed={onMarkUsed}
      />
    );
  };

  const leafOnB = turn === 1;
  const leafStyle: React.CSSProperties = wide
    ? {
        top: 0,
        bottom: 0,
        width: '50%',
        left: leafOnB ? '50%' : 0,
        transformOrigin: leafOnB ? 'left center' : 'right center',
      }
    : {
        left: 0,
        right: 0,
        height: '50%',
        top: leafOnB ? '50%' : 0,
        transformOrigin: leafOnB ? 'center top' : 'center bottom',
      };

  const interactive = status === 'ready' && items.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center gap-3">
      <div
        ref={sceneRef}
        className="relative w-full max-w-[900px] min-h-0 flex-1 sm:max-h-[620px]"
        style={{ perspective: '1800px' }}
        aria-roledescription="wallet"
        aria-live="polite"
      >
        {/* Wallet leather */}
        <div
          className="absolute inset-0 border-4 border-[#1b1530]"
          style={{ background: PX.wood, boxShadow: `8px 8px 0 0 ${PX.ink}` }}
        />
        <div
          className={`relative grid h-full w-full ${wide ? 'grid-cols-2' : 'grid-rows-2'}`}
          style={{ transformStyle: 'preserve-3d' }}
        >
          <Flap side="a" wide={wide}>
            {renderItem(underA, 'a')}
          </Flap>
          <Flap side="b" wide={wide}>
            {renderItem(underB, 'b')}
          </Flap>
        </div>

        {/* Spine */}
        <div
          aria-hidden
          className={`pointer-events-none absolute ${
            wide ? 'top-1 bottom-1 left-1/2 w-3 -translate-x-1/2' : 'left-1 right-1 top-1/2 h-3 -translate-y-1/2'
          }`}
          style={{
            background: '#7a4f2c',
            borderLeft: wide ? `2px solid ${PX.ink}` : undefined,
            borderRight: wide ? `2px solid ${PX.ink}` : undefined,
            borderTop: wide ? undefined : `2px solid ${PX.ink}`,
            borderBottom: wide ? undefined : `2px solid ${PX.ink}`,
          }}
        />

        {turn !== null && leafFront && leafBack && (
          <div
            ref={leafRef}
            className="absolute z-20"
            style={{ ...leafStyle, transformStyle: 'preserve-3d' }}
          >
            <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
              <Flap side={leafFront.side} wide={wide} leaf>
                {renderItem(leafFront.item, leafFront.side)}
              </Flap>
            </div>
            <div
              className="absolute inset-0"
              style={{
                backfaceVisibility: 'hidden',
                WebkitBackfaceVisibility: 'hidden',
                transform: wide ? 'rotateY(180deg)' : 'rotateX(180deg)',
              }}
            >
              <Flap side={leafBack.side} wide={wide} leaf>
                {renderItem(leafBack.item, leafBack.side)}
              </Flap>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="px-btn font-pixel !px-3 !py-1 text-lg"
          onClick={() => flip(-1)}
          disabled={!interactive || spread === 0 || turn !== null}
          aria-label="Previous spread"
        >
          ◀
        </button>
        <span className="font-pixel min-w-[4.5rem] text-center text-lg text-[#1b1530]" aria-live="polite">
          {spread + 1} / {spreadCount}
        </span>
        <button
          type="button"
          className="px-btn font-pixel !px-3 !py-1 text-lg"
          onClick={() => flip(1)}
          disabled={!interactive || spread >= spreadCount - 1 || turn !== null}
          aria-label="Next spread"
        >
          ▶
        </button>
      </div>
    </div>
  );
}

function Flap({ side, wide, leaf, children }: { side: Side; wide: boolean; leaf?: boolean; children: ReactNode }) {
  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col p-2.5 sm:p-4"
      style={leaf ? { background: PX.wood, border: `4px solid ${PX.ink}` } : undefined}
    >
      {/* Stitching */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-1.5 border-2 border-dashed"
        style={{ borderColor: '#6b4424' }}
      />
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-1 pt-1">
        {children}
      </div>
      {/* Card pocket */}
      <div
        aria-hidden
        className={`relative -mt-3 h-5 shrink-0 border-4 border-[#1b1530] sm:h-7 ${wide ? '' : ''}`}
        style={{
          background: side === 'a' ? '#8f5f36' : '#94633a',
          boxShadow: `inset 0 4px 0 0 #c48d5a`,
        }}
      >
        <div className="absolute inset-x-2 top-1/2 border-t-2 border-dashed" style={{ borderColor: '#5a381c' }} />
      </div>
    </div>
  );
}

function EmptySlot({ sprite }: { sprite?: boolean }) {
  return (
    <div
      className="flex h-full max-h-[220px] w-full max-w-[380px] items-center justify-center border-4 border-dashed"
      style={{ borderColor: '#6b4424', background: '#9a6a40' }}
    >
      {sprite && <PixelSprite rows={COIN} palette={COIN_PALETTE} scale={6} title="Empty wallet coin" />}
    </div>
  );
}

function EmptyCard({ filtered }: { filtered: boolean }) {
  return (
    <div className="px-panel flex w-full max-w-[380px] flex-col items-center gap-3 p-4 text-center">
      <p className="font-pixel-body text-xl leading-tight">
        {filtered
          ? 'No saved codes match your search.'
          : 'No codes or offers saved yet - import a coupon or business card on the Import tab'}
      </p>
      {!filtered && (
        <Link href="/import" className="px-btn text-sm">
          Go to Import
        </Link>
      )}
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="px-panel flex w-full max-w-[380px] flex-col items-center gap-3 p-6" role="status">
      <div className="px-loader" />
      <span className="font-pixel text-sm">Loading wallet…</span>
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="px-panel flex w-full max-w-[380px] flex-col items-center gap-3 p-4 text-center" role="alert">
      <p className="font-pixel-body text-xl leading-tight">Could not load your wallet.</p>
      <button type="button" className="px-btn text-sm !bg-[#ff4f5e]" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}
