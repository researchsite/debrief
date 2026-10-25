import type { CSSProperties, DragEventHandler, ReactNode } from 'react';
import { PixelSprite, PX } from '@/components/pixel';
import { ConferenceBackdrop } from './ConferenceBackdrop';
import './import-scene.css';

/** Length in scene units; --u is 4px on phones and grows on wider screens. */
const u = (n: number) => `calc(var(--u) * ${n})`;
/** Length in hand-pixel units (--h), so the hands can be chunkier than the camera details. */
const h = (n: number) => `calc(var(--h) * ${n})`;
const spriteSize = (rows: string[], unit = h): CSSProperties => ({ width: unit(rows[0].length), height: unit(rows.length), display: 'block' });

const SKIN = { O: PX.ink, s: PX.skin, d: PX.skinShade, n: '#ffe3cc', c: PX.blue, k: '#2557b8', w: PX.white };

/* Left hand cradling the body from below; fingertips curl up the left side (body edge between cols 4 and 5, bottom at row 6). */
const LEFT_HAND = [
  '.OOO..................',
  'OnnsO.................',
  'OsssdO................',
  'OsssdO................',
  'OsssdOOO..............',
  'OsssssdO..............',
  'OssssssOOOOOOOOOOOOOO.',
  'OssssssssssssssssssdO.',
  'OssssssssssssssssssddO',
  '.OssssssssssssssssddO.',
  '.OOsssssssssssssdddO..',
  '...OOsssssssssddOO....',
  '.....OOsssssddO.......',
  '......OOOOOOOOO.......',
  '......OwwwwwwwO.......',
  '......OOOOOOOOO.......',
  '......OcccccckO.......',
  '......OcccccckO.......',
];

/* The same hand mirrored, cradling the lens barrel from below with fingertips curling up its far end. */
const LENS_HAND = LEFT_HAND.map((row) => row.split('').reverse().join(''));

/** Diagonal neck strap leaving a lug toward the top-right; mirrored for the left lug. */
const STRAP_RIGHT = Array.from({ length: 14 }, (_, y) => {
  const x = 13 - y;
  const row = Array(16).fill('.');
  row[x] = 'O'; row[x + 1] = 'r'; row[x + 2] = 'y'; row[x + 3] = 'O';
  return row.join('');
});
const STRAP_LEFT = STRAP_RIGHT.map((row) => row.split('').reverse().join(''));
const STRAP_PALETTE = { O: PX.ink, r: PX.red, y: PX.sun };

/** Pixel-stepped rounded rectangle clip, `s` = step size. */
function stepped(s: string): string {
  const a = s; const b = `calc(${s} * 2)`;
  return `polygon(${b} 0, calc(100% - ${b}) 0, calc(100% - ${b}) ${a}, calc(100% - ${a}) ${a}, calc(100% - ${a}) ${b}, 100% ${b}, 100% calc(100% - ${b}), calc(100% - ${a}) calc(100% - ${b}), calc(100% - ${a}) calc(100% - ${a}), calc(100% - ${b}) calc(100% - ${a}), calc(100% - ${b}) 100%, ${b} 100%, ${b} calc(100% - ${a}), ${a} calc(100% - ${a}), ${a} calc(100% - ${b}), 0 calc(100% - ${b}), 0 ${b}, ${a} ${b}, ${a} ${a}, ${b} ${a})`;
}

/** Ink-outlined block with a pixel bevel, used for top-plate parts. */
function Part({ style, children }: { style: CSSProperties; children?: ReactNode }) {
  return (
    <div
      aria-hidden
      className="absolute"
      style={{ border: `3px solid ${PX.ink}`, background: 'var(--imp-body)', boxShadow: 'inset 0 3px 0 var(--imp-body-hi), inset 0 -3px 0 var(--imp-body-lo)', ...style }}
    >
      {children}
    </div>
  );
}

const RIDGES = `repeating-linear-gradient(90deg, #8c8aa3 0 3px, #55526b 3px 6px)`;

/** Stepped-octagon clip; on a narrow box it reads as a pixel ellipse. */
const OVAL = 'polygon(30% 0, 70% 0, 70% 6%, 85% 6%, 85% 15%, 94% 15%, 94% 30%, 100% 30%, 100% 70%, 94% 70%, 94% 85%, 85% 85%, 85% 94%, 70% 94%, 70% 100%, 30% 100%, 30% 94%, 15% 94%, 15% 85%, 6% 85%, 6% 70%, 0 70%, 0 30%, 6% 30%, 6% 15%, 15% 15%, 15% 6%, 30% 6%)';
/** Hard-stop light and shadow bands that make a flat strip read as a cylinder. */
const CYLINDER = 'linear-gradient(180deg, rgba(0,0,0,0.4) 0 8%, transparent 8% 16%, rgba(255,255,255,0.22) 16% 26%, transparent 26% 64%, rgba(0,0,0,0.2) 64% 80%, rgba(0,0,0,0.42) 80% 100%)';

/**
 * One ring of the lens barrel. Rings have their own diameters (`size`, % of the barrel height), so the
 * silhouette steps like a real zoom lens; they shrink slightly toward the front because it is farther away.
 */
function Ring({ grow, size, background, className = '', children }: { grow: number; size: number; background: string; className?: string; children?: ReactNode }) {
  return (
    <div
      className={`relative -ml-[3px] flex min-w-0 items-center justify-center first:ml-0 ${className}`}
      style={{ flex: `${grow} 1 0`, height: `${size}%`, background, border: `3px solid ${PX.ink}` }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: CYLINDER }} />
      {children}
    </div>
  );
}

/**
 * Zoom lens seen in profile, sticking out of the camera's right side: mount, red ring with index mark,
 * printed focal-length scale, ridged zoom ring, focus ring and front glass.
 */
function LensBarrel() {
  return (
    <div aria-hidden className="imp-lens pointer-events-none absolute">
      <div className="absolute inset-0 flex items-center">
        <Ring grow={1} size={76} background="repeating-linear-gradient(180deg, #c9c7d9 0 4px, #8c8aa3 4px 7px)" />
        <Ring grow={1.2} size={92} background="#1f1b2e">
          <span className="absolute inset-y-0 left-[30%] w-[3px]" style={{ background: PX.red }} />
          <span className="absolute left-[62%] top-1/2 h-[6px] w-[6px] -translate-y-1/2" style={{ background: PX.white }} />
        </Ring>
        <Ring grow={2} size={92} background="#2a2639">
          <span className="imp-lens-scale font-pixel-body relative flex flex-col items-center leading-none" style={{ color: '#d8d6e6' }}>
            <span>24</span>
            <span>35</span>
            <span style={{ color: PX.sun }}>50</span>
            <span>70</span>
          </span>
        </Ring>
        <Ring grow={4.2} size={100} background="repeating-linear-gradient(90deg, #5d5780 0 var(--imp-ridge), #141020 var(--imp-ridge) calc(var(--imp-ridge) * 2))" />
        <Ring grow={0.8} size={88} background="#2a2639" className="max-sm:hidden" />
        <Ring grow={2.2} size={90} background="repeating-linear-gradient(90deg, #4a4562 0 3px, #1a1626 3px 6px)" className="max-sm:hidden" />
        <Ring grow={1.3} size={95} background="#141020">
          <span className="absolute inset-y-0 right-0 w-[30%]" style={{ background: '#9f9cb4' }} />
        </Ring>
      </div>
      {/* Front glass: a narrow pixel ellipse (we see it nearly edge-on) with coated rings and a glint. */}
      <div className="absolute" style={{ right: 'calc(var(--u) * -3)', top: '3%', bottom: '3%', width: 'calc(var(--u) * 6)', clipPath: OVAL, background: PX.ink }}>
        <div className="absolute" style={{ inset: 3, clipPath: OVAL, background: '#3a3550' }}>
          <div className="absolute" style={{ inset: '6% 18%', clipPath: OVAL, background: '#141020' }}>
            <div className="absolute" style={{ inset: '8% 14%', clipPath: OVAL, background: 'linear-gradient(180deg, #5b4fd6 0 22%, #262a78 22% 62%, #2f7d6c 62% 74%, #1a1748 74% 100%)' }} />
            <div className="absolute" style={{ left: '30%', top: '16%', width: '28%', height: '12%', background: PX.white }} />
            <div className="absolute" style={{ left: '30%', top: '32%', width: '28%', height: '5%', background: PX.white, opacity: 0.7 }} />
          </div>
        </div>
      </div>
      {/* Right hand cradling the barrel from below */}
      <div className="absolute z-10" style={{ right: h(0.5), top: `calc(100% - ${h(6.5)})` }}>
        <PixelSprite rows={LENS_HAND} palette={SKIN} style={spriteSize(LENS_HAND)} />
        <div style={{ marginLeft: h(7), width: h(9), height: '100vh', background: PX.blue, borderLeft: `${h(1)} solid ${PX.ink}`, borderRight: `${h(1)} solid ${PX.ink}`, boxShadow: `inset ${h(-1)} 0 0 #2557b8` }} />
      </div>
    </div>
  );
}

interface CameraFrameProps {
  /** Content shown on the LCD screen. */
  children: ReactNode;
  /** Camera buttons for the control panel. */
  controls: ReactNode;
  /** Increment to fire the full-screen flash. */
  flashKey?: number;
  dragOver?: boolean;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
}

/**
 * Photographer POV: a chunky pixel camera seen from the back and slightly to its right, so its side and
 * zoom lens show in profile. One hand cradles the body, the other the lens.
 * The back is split into an LCD screen (2/3) hosting page content and a control panel (1/3).
 */
export function CameraFrame({ children, controls, flashKey = 0, dragOver = false, onDragOver, onDragLeave, onDrop }: CameraFrameProps) {
  return (
    <div
      className="imp-stage relative w-full overflow-hidden"
      style={{ height: 'calc(100svh - 4rem)', background: '#4b3f99' }}
    >
      <ConferenceBackdrop />

      {/* Body box: everything else is positioned relative to it. */}
      <div className="imp-body absolute">
        {/* Right side face, seen because the viewpoint sits a little to the camera's right */}
        <div aria-hidden className="imp-side absolute" style={{ background: PX.ink }}>
          <div className="absolute" style={{ inset: '3px 3px 3px 0', clipPath: 'inherit', background: 'linear-gradient(90deg, var(--imp-body-lo) 0 45%, #17131f 45% 100%)' }} />
        </div>
        <LensBarrel />

        {/* Neck strap */}
        <PixelSprite rows={STRAP_LEFT} palette={STRAP_PALETTE} className="pointer-events-none absolute" style={{ ...spriteSize(STRAP_LEFT, u), left: u(-14), top: u(-8) }} />
        <PixelSprite rows={STRAP_RIGHT} palette={STRAP_PALETTE} className="pointer-events-none absolute hidden sm:block" style={{ ...spriteSize(STRAP_RIGHT, u), right: u(-14), top: u(-8) }} />
        {/* Strap lugs */}
        <Part style={{ left: u(-2), top: u(3), width: u(3), height: u(5), background: PX.stone }} />
        <Part style={{ right: u(-2), top: u(3), width: u(3), height: u(5), background: PX.stone }} />

        {/* Top plate: mode dial, viewfinder hump with hot shoe, command dial, shutter */}
        <Part style={{ left: '12%', bottom: 'calc(100% - 3px)', width: u(11), height: u(3), background: RIDGES }} />
        <Part style={{ left: `calc(12% + ${u(1.5)})`, bottom: `calc(100% + ${u(3)} - 6px)`, width: u(8), height: u(1.5), background: '#55526b' }} />
        <div aria-hidden className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 'calc(100% - 3px)', width: u(28), height: u(6), background: PX.ink, clipPath: 'polygon(14% 0, 86% 0, 86% 30%, 100% 30%, 100% 100%, 0 100%, 0 30%, 14% 30%)' }}>
          <div className="absolute inset-[3px] bottom-0" style={{ background: 'var(--imp-body)', clipPath: 'polygon(14% 0, 86% 0, 86% 30%, 100% 30%, 100% 100%, 0 100%, 0 30%, 14% 30%)', boxShadow: 'inset 0 3px 0 var(--imp-body-hi)' }} />
        </div>
        <Part style={{ left: '50%', transform: 'translateX(-50%)', bottom: `calc(100% + ${u(6)} - 6px)`, width: u(12), height: u(1.5), background: PX.stone }} />
        <Part style={{ right: u(14), bottom: 'calc(100% - 3px)', width: u(8), height: u(2), background: RIDGES }} />
        <Part style={{ right: u(4), bottom: 'calc(100% - 3px)', width: u(7), height: u(2) }} />
        <Part style={{ right: u(5), bottom: `calc(100% + ${u(2)} - 6px)`, width: u(5), height: u(1.5), background: PX.red }} />

        {/* Camera body */}
        <div className="absolute inset-0" style={{ background: PX.ink, clipPath: stepped(u(1)) }}>
          <div
            className="absolute flex flex-col gap-[calc(var(--u)*2)] sm:flex-row"
            style={{
              inset: 4,
              clipPath: stepped(u(1)),
              background: 'var(--imp-body)',
              boxShadow: `inset ${u(1)} ${u(1)} 0 var(--imp-body-hi), inset ${u(-1)} ${u(-1)} 0 var(--imp-body-lo)`,
              padding: `${u(5)} ${u(5.5)} ${u(4)} ${u(3)}`,
            }}
          >
            {/* Rubber thumb rest along the right edge */}
            <div aria-hidden className="absolute" style={{ right: u(1), top: u(2), bottom: u(2), width: u(3), backgroundColor: '#24202f', backgroundImage: 'radial-gradient(#3a3550 1px, transparent 1.5px)', backgroundSize: '6px 6px', border: `2px solid ${PX.ink}` }} />
            {/* Eyepiece */}
            <div aria-hidden className="absolute left-1/2 -translate-x-1/2" style={{ top: 0, width: u(14), height: u(4.5), background: '#141020', border: `3px solid ${PX.ink}`, borderTop: 0 }}>
              <div className="mx-auto" style={{ marginTop: u(0.8), width: u(7), height: u(2), background: '#2d3a6a', boxShadow: `inset ${u(1)} 0 0 #4a5a9a` }} />
            </div>
            <span className="font-pixel pointer-events-none absolute text-[8px] tracking-widest sm:text-[10px]" style={{ left: u(3), top: u(1.6), color: PX.stone }}>DEBRIEF D-1</span>

            {/* LCD screen */}
            <div
              className="relative min-h-0 flex-[2] sm:min-w-0"
              style={{ background: '#0d0a18', border: `3px solid ${PX.ink}`, padding: u(1), boxShadow: `0 0 0 2px #4a4562` }}
            >
              <div
                className="relative h-full w-full overflow-hidden"
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                style={{
                  backgroundColor: dragOver ? '#fff3b8' : '#e8f6f1',
                  backgroundImage: 'linear-gradient(rgba(27,21,48,0.05) 1px, transparent 1px), linear-gradient(to right, rgba(27,21,48,0.05) 1px, transparent 1px)',
                  backgroundSize: '14px 14px',
                  outline: dragOver ? `4px dashed ${PX.ink}` : undefined,
                  outlineOffset: -8,
                  boxShadow: 'inset 4px 4px 0 rgba(27,21,48,0.18)',
                }}
              >
                {/* HUD */}
                <div className="font-pixel-body pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between px-2 py-0.5 text-sm leading-none sm:px-3 sm:text-lg" style={{ background: 'rgba(13,10,24,0.82)', color: PX.white }}>
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="imp-rec inline-block h-2.5 w-2.5" style={{ background: PX.red }} />
                    <span style={{ color: PX.red }}>REC</span>
                  </span>
                  <span className="tracking-wider" style={{ color: PX.sun }}><span className="max-sm:hidden">ISO 400 · </span>F2.8 · 1/60</span>
                  <span aria-hidden className="inline-flex h-3 w-7 items-stretch gap-[2px] border-2 p-[1px]" style={{ borderColor: PX.white }}>
                    <span className="flex-1" style={{ background: PX.grass }} />
                    <span className="flex-1" style={{ background: PX.grass }} />
                    <span className="flex-1" style={{ background: PX.grass }} />
                  </span>
                </div>
                <div className="absolute inset-0 overflow-y-auto overscroll-contain">
                  <div className="mx-auto flex min-h-full w-full max-w-[640px] flex-col px-3 pt-8 pb-4 sm:px-6 sm:pt-10">{children}</div>
                </div>
              </div>
            </div>

            {/* Control panel */}
            <div className="relative flex min-h-0 flex-1 flex-row gap-3 sm:min-w-0 sm:flex-col sm:gap-4">{controls}</div>
          </div>
        </div>

        {/* Left hand cradling the body from below; the right hand holds the lens */}
        <div className="pointer-events-none absolute z-20" style={{ left: h(-5), top: `calc(100% - ${h(6)})` }}>
          <PixelSprite rows={LEFT_HAND} palette={SKIN} style={spriteSize(LEFT_HAND)} />
          <div style={{ marginLeft: h(6), width: h(9), height: '100vh', background: PX.blue, borderLeft: `${h(1)} solid ${PX.ink}`, borderRight: `${h(1)} solid ${PX.ink}`, boxShadow: `inset ${h(-1)} 0 0 #2557b8` }} />
        </div>
      </div>

      {flashKey > 0 && <div key={flashKey} aria-hidden className="imp-flash" />}
    </div>
  );
}
