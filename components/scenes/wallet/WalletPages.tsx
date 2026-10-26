import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import type { CouponData } from '@/lib/graph-writes';
import { PX, PixelSprite } from '@/components/pixel';
import { CouponTicket } from './CouponTicket';

export type WalletStatus = 'loading' | 'error' | 'ready';

/** One side of a wallet leaf. */
export type PageSpec =
  | { kind: 'cover' }
  | { kind: 'slots'; key: string }
  | { kind: 'coupon'; coupon: CouponData }
  | { kind: 'message' };

/** Which edge of the page is bound into the spine. */
export type SpineSide = 'left' | 'right';

const LEATHER = PX.wood;
const LEATHER_DARK = '#8f5f36';
const STITCH = '#6b4424';
const POCKET = '#94633a';
const POCKET_LIP = '#c48d5a';

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

const BADGE = [
  '...kkkk...',
  '..khhhhk..',
  '.khhhhhhk.',
  '.khsssshk.',
  '.ksksskst.',
  '.kssssssk.',
  '..ksrrsk..',
  '...kssk...',
  '.kppppppk.',
  'kppppppppk',
  'kppwppwppk',
  'kppppppppk',
];
const BADGE_PALETTE = {
  k: PX.ink,
  h: PX.hair,
  s: PX.skin,
  t: PX.skin,
  r: PX.red,
  p: PX.purple,
  w: PX.paper,
};

/** Leather page shell: stitching, spine shading, and a stitched pocket at the bottom. */
export function LeafShell({
  spine,
  pocket = true,
  children,
}: {
  spine: SpineSide;
  pocket?: boolean;
  children?: ReactNode;
}) {
  const spineShade: CSSProperties = {
    background: `linear-gradient(to ${spine === 'left' ? 'right' : 'left'}, rgba(27,21,48,0.28), rgba(27,21,48,0) 14%)`,
  };
  return (
    <div
      className="relative flex h-full w-full min-h-0 flex-col p-2.5 sm:p-4"
      style={{ background: LEATHER, border: `4px solid ${PX.ink}` }}
    >
      <div aria-hidden className="pointer-events-none absolute inset-0" style={spineShade} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-1.5 border-2 border-dashed"
        style={{ borderColor: STITCH }}
      />
      <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-1 pt-1">
        {children}
      </div>
      {pocket && <Pocket />}
    </div>
  );
}

function Pocket() {
  return (
    <div
      aria-hidden
      className="relative -mt-3 h-6 shrink-0 border-4 sm:h-8"
      style={{ borderColor: PX.ink, background: POCKET, boxShadow: `inset 0 4px 0 0 ${POCKET_LIP}` }}
    >
      <div className="absolute inset-x-2 top-1/2 border-t-2 border-dashed" style={{ borderColor: '#5a381c' }} />
    </div>
  );
}

/** Plain leather lining used on the reverse of a single-page leaf. */
export function LeafLining() {
  return (
    <div
      className="relative h-full w-full"
      style={{
        background: LEATHER_DARK,
        border: `4px solid ${PX.ink}`,
        backgroundImage: 'repeating-linear-gradient(45deg, rgba(27,21,48,0.08) 0 4px, transparent 4px 12px)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-1.5 border-2 border-dashed"
        style={{ borderColor: STITCH }}
      />
    </div>
  );
}

export interface PageContext {
  status: WalletStatus;
  count: number;
  filtered: boolean;
  eventName: string | null;
  copiedCode: string | null;
  onCopy: (code: string) => void;
  onMarkUsed: (code: string) => void;
  onUpdate: (code: string, patch: { vendor?: string; value?: string; description?: string; expires?: string | null }) => Promise<void>;
  onRetry: () => void;
}

/** Renders one page (leaf side) of the wallet. */
export function WalletPage({ spec, spine, ctx }: { spec: PageSpec; spine: SpineSide; ctx: PageContext }) {
  switch (spec.kind) {
    case 'cover':
      return (
        <LeafShell spine={spine} pocket={false}>
          <IdCard ctx={ctx} />
        </LeafShell>
      );
    case 'slots':
      return (
        <LeafShell spine={spine} pocket={false}>
          <CardSlots />
        </LeafShell>
      );
    case 'coupon':
      return (
        <LeafShell spine={spine} pocket={false}>
          <div className="relative flex w-full max-w-[380px] flex-col items-center">
            <CouponTicket
              coupon={spec.coupon}
              copied={ctx.copiedCode === spec.coupon.code}
              onCopy={ctx.onCopy}
              onMarkUsed={ctx.onMarkUsed}
              onUpdate={ctx.onUpdate}
            />
            {/* Slot front: the ticket is tucked into this pocket. */}
            <div
              aria-hidden
              className="pointer-events-none relative -mt-3 h-7 w-[calc(100%+16px)] border-4"
              style={{ borderColor: PX.ink, background: POCKET, boxShadow: `inset 0 4px 0 0 ${POCKET_LIP}` }}
            >
              <div className="absolute inset-x-2 top-1/2 border-t-2 border-dashed" style={{ borderColor: '#5a381c' }} />
            </div>
          </div>
        </LeafShell>
      );
    case 'message':
      return (
        <LeafShell spine={spine}>
          {ctx.status === 'loading' ? (
            <LoadingCard />
          ) : ctx.status === 'error' ? (
            <ErrorCard onRetry={ctx.onRetry} />
          ) : (
            <EmptyCard filtered={ctx.filtered} />
          )}
        </LeafShell>
      );
  }
}

/** Inside-cover owner card. */
function IdCard({ ctx }: { ctx: PageContext }) {
  let statusLine: ReactNode;
  if (ctx.status === 'loading') statusLine = 'Loading codes…';
  else if (ctx.status === 'error') statusLine = 'Wallet unavailable';
  else if (ctx.count === 0) statusLine = ctx.filtered ? 'No matches' : 'No codes yet';
  else statusLine = `${ctx.count} ${ctx.count === 1 ? 'code' : 'codes'} ${ctx.filtered ? 'found' : 'saved'}`;

  return (
    <div className="flex w-full max-w-[360px] flex-col items-center gap-4">
      <div
        className="w-full -rotate-1 border-4 bg-[#fff7e6] text-[#1b1530]"
        style={{ borderColor: PX.ink, boxShadow: `4px 4px 0 0 ${PX.ink}` }}
      >
        <div
          className="flex items-center justify-between gap-2 border-b-4 px-3 py-1.5"
          style={{ borderColor: PX.ink, background: PX.purple }}
        >
          <span className="font-pixel text-base font-bold tracking-wider text-white [text-shadow:2px_2px_0_#1b1530]">
            DEBRIEF WALLET
          </span>
          <PixelSprite rows={COIN} palette={COIN_PALETTE} scale={3} />
        </div>
        <div className="flex gap-3 p-3">
          <div
            className="flex shrink-0 items-end justify-center border-4 px-1 pt-2"
            style={{ borderColor: PX.ink, background: PX.sky }}
          >
            <PixelSprite rows={BADGE} palette={BADGE_PALETTE} scale={5} title="Wallet owner" />
          </div>
          <dl className="font-pixel-body flex min-w-0 flex-1 flex-col gap-1 text-lg leading-none">
            <div>
              <dt className="font-pixel text-[10px] tracking-widest opacity-60">EVENT</dt>
              <dd className="truncate">{ctx.eventName || 'Conference pass'}</dd>
            </div>
            <div>
              <dt className="font-pixel text-[10px] tracking-widest opacity-60">HOLDER</dt>
              <dd className="truncate">Attendee</dd>
            </div>
            <div>
              <dt className="font-pixel text-[10px] tracking-widest opacity-60">STATUS</dt>
              <dd className="truncate">{statusLine}</dd>
            </div>
          </dl>
        </div>
        <div
          aria-hidden
          className="h-3 border-t-4"
          style={{
            borderColor: PX.ink,
            backgroundImage: `repeating-linear-gradient(90deg, ${PX.ink} 0 3px, transparent 3px 5px, ${PX.ink} 5px 6px, transparent 6px 10px)`,
          }}
        />
      </div>
      {ctx.status === 'error' && (
        <button type="button" className="px-btn text-sm !bg-[#ff4f5e]" onClick={ctx.onRetry}>
          Retry
        </button>
      )}
      <p className="font-pixel text-center text-xs text-[#1b1530] opacity-75">Scroll or swipe to flip ▼</p>
    </div>
  );
}

/** Empty card slots with faint hints. */
function CardSlots() {
  return (
    <div className="flex h-full w-full max-w-[380px] flex-col justify-center gap-3 py-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="relative flex max-h-[140px] min-h-[64px] flex-1 items-center justify-center border-4 sm:max-h-[120px]"
          style={{
            borderColor: PX.ink,
            background: POCKET,
            boxShadow: `inset 0 6px 0 0 ${LEATHER_DARK}, inset 0 -4px 0 0 ${POCKET_LIP}`,
          }}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-1.5 border-2 border-dashed"
            style={{ borderColor: '#5a381c' }}
          />
          <span className="font-pixel text-xs tracking-widest text-[#1b1530] opacity-35">empty slot</span>
        </div>
      ))}
    </div>
  );
}

function EmptyCard({ filtered }: { filtered: boolean }) {
  return (
    <div className="px-panel flex w-full max-w-[380px] flex-col items-center gap-3 p-4 text-center">
      {!filtered && <PixelSprite rows={COIN} palette={COIN_PALETTE} scale={5} title="Empty wallet coin" />}
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
