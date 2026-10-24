import type { ReactNode } from 'react';
import { PixelSprite, PX } from '@/components/pixel';

/* Left hand seen from behind the camera: thumb on the back, wrist and sleeve exiting the bottom. */
const LEFT_HAND = [
  '.........OOOO...',
  '........OnnssO..',
  '........OnnssO..',
  '........OsssdO..',
  '...OOOO.OsssdO..',
  '..OssssOOsssdO..',
  '.OssssssssssdO..',
  'OsssssssssssdO..',
  'OssssssssssddO..',
  'OssssssssssdO...',
  'OsssssssssddO...',
  'OssssssssddO....',
  '.OsssssssdO.....',
  '.OssssssddO.....',
  '.OOsssssdOO.....',
  'OOOOOOOOOOOO....',
  'OccccccccckO....',
  'OccccccccckO....',
  'OccccccccckO....',
  'OccccccccckO....',
  'OccccccccckO....',
];
const RIGHT_HAND = LEFT_HAND.map((row) => row.split('').reverse().join(''));

const HAND_PALETTE = {
  O: PX.ink,
  s: PX.skin,
  d: PX.skinShade,
  n: '#ffe0c8',
  c: PX.blue,
  k: '#2557b8',
};

const CLOUD = [
  '....OOOO......',
  '..OOwwwwOO....',
  '.OwwwwwwwwOOO.',
  'OwwwwwwwwwwwwO',
  'OOOOOOOOOOOOOO',
];
const CLOUD_PALETTE = { O: '#cfeeff', w: PX.white };

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute z-20 h-5 w-5 sm:h-7 sm:w-7 ${className}`}
      style={{ filter: `drop-shadow(2px 2px 0 ${PX.ink})` }}
    />
  );
}

/**
 * Static photographer-POV composition: a pixel camera body held by two hands,
 * framing a scrollable viewfinder that hosts the page content.
 */
export function CameraFrame({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ height: 'calc(100svh - 4rem)', background: `linear-gradient(${PX.sky} 0 70%, #9fe0ff 70% 100%)` }}
    >
      <PixelSprite rows={CLOUD} palette={CLOUD_PALETTE} scale={5} className="absolute left-[6%] top-1" />
      <PixelSprite rows={CLOUD} palette={CLOUD_PALETTE} scale={4} className="absolute right-[8%] top-3 hidden sm:block" />

      <div className="relative mx-auto h-full w-full max-w-[900px] px-2 pt-5 pb-10 sm:px-6 sm:pt-7 sm:pb-12">
        {/* Top plate details: mode dial and shutter button */}
        <div aria-hidden className="absolute left-[14%] top-2 h-4 w-12 border-4 sm:top-3 sm:h-5 sm:w-16" style={{ background: PX.stone, borderColor: PX.ink }} />
        <div aria-hidden className="absolute right-[16%] top-1 sm:top-1.5 flex flex-col items-center">
          <div className="h-3 w-8 border-4 border-b-0 sm:w-10" style={{ background: PX.red, borderColor: PX.ink }} />
          <div className="h-3 w-14 border-4 border-b-0 sm:h-4 sm:w-16" style={{ background: PX.night, borderColor: PX.ink }} />
        </div>

        {/* Camera body */}
        <div
          className="relative flex h-full flex-col border-4 px-3 sm:px-5"
          style={{ background: PX.night, borderColor: PX.ink, boxShadow: `6px 6px 0 0 ${PX.ink}, inset 0 4px 0 0 #3d3470` }}
        >
          {/* HUD along the top edge */}
          <div className="font-pixel-body flex h-8 shrink-0 items-center justify-between text-base leading-none sm:h-10 sm:text-xl" style={{ color: PX.white }}>
            <span className="flex items-center gap-2">
              <span aria-hidden className="inline-block h-3 w-3" style={{ background: PX.red, boxShadow: `0 0 0 2px ${PX.ink}` }} />
              <span style={{ color: PX.red }}>REC</span>
            </span>
            <span className="tracking-wider" style={{ color: PX.sun }}>ISO 400&nbsp;&nbsp;1/60&nbsp;&nbsp;F2.8</span>
          </div>

          {/* Viewfinder screen */}
          <div
            className="relative min-h-0 flex-1 border-4"
            style={{
              borderColor: PX.ink,
              backgroundColor: '#e8f6f1',
              backgroundImage: [
                'linear-gradient(to right, transparent calc(33.333% - 1px), rgba(27,21,48,0.12) calc(33.333% - 1px) calc(33.333% + 1px), transparent calc(33.333% + 1px), transparent calc(66.666% - 1px), rgba(27,21,48,0.12) calc(66.666% - 1px) calc(66.666% + 1px), transparent calc(66.666% + 1px))',
                'linear-gradient(to bottom, transparent calc(33.333% - 1px), rgba(27,21,48,0.12) calc(33.333% - 1px) calc(33.333% + 1px), transparent calc(33.333% + 1px), transparent calc(66.666% - 1px), rgba(27,21,48,0.12) calc(66.666% - 1px) calc(66.666% + 1px), transparent calc(66.666% + 1px))',
                'linear-gradient(rgba(27,21,48,0.04) 1px, transparent 1px)',
                'linear-gradient(to right, rgba(27,21,48,0.04) 1px, transparent 1px)',
              ].join(','),
              backgroundSize: '100% 100%, 100% 100%, 16px 16px, 16px 16px',
              boxShadow: `inset 4px 4px 0 0 rgba(27,21,48,0.18)`,
            }}
          >
            <Corner className="left-2 top-2 border-l-4 border-t-4 border-white" />
            <Corner className="right-2 top-2 border-r-4 border-t-4 border-white" />
            <Corner className="bottom-2 left-2 border-b-4 border-l-4 border-white" />
            <Corner className="bottom-2 right-2 border-b-4 border-r-4 border-white" />
            <div className="absolute inset-0 overflow-y-auto overscroll-contain">
              <div className="mx-auto w-full max-w-[640px] px-4 pt-6 pb-24 sm:px-8 sm:pt-8">{children}</div>
            </div>
          </div>

          {/* Bottom edge: battery and shot counter */}
          <div className="font-pixel-body flex h-8 shrink-0 items-center justify-center gap-3 text-base leading-none sm:h-10 sm:text-xl" style={{ color: PX.stone }}>
            <span aria-hidden className="inline-flex h-3 w-7 items-stretch gap-[2px] border-2 p-[1px]" style={{ borderColor: PX.stone }}>
              <span className="flex-1" style={{ background: PX.grass }} />
              <span className="flex-1" style={{ background: PX.grass }} />
              <span className="flex-1" style={{ background: PX.grass }} />
            </span>
            <span>[ 24 ]</span>
          </div>
        </div>
      </div>

      {/* Hands gripping the bottom corners */}
      <PixelSprite rows={LEFT_HAND} palette={HAND_PALETTE} scale={5} className="pointer-events-none absolute bottom-0 z-30 h-auto w-20 sm:w-24" style={{ left: 'max(0px, calc(50% - 470px))' }} />
      <PixelSprite rows={RIGHT_HAND} palette={HAND_PALETTE} scale={5} className="pointer-events-none absolute bottom-0 z-30 h-auto w-20 sm:w-24" style={{ right: 'max(0px, calc(50% - 470px))' }} />
    </div>
  );
}
