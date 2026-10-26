'use client';

import type { CSSProperties, ReactNode } from 'react';
import { PX, PixelSprite } from '@/components/pixel';

// ── Pixel-art projector sprite ────────────────────────────────
const PROJECTOR_SPRITE = [
  '....kkkk....',
  '...kwwwwk...',
  '..kwwwwwwk..',
  '.kkkkkkkkkkk',
  '.kpppppppppk',
  '.kpppppppppk',
  '.kkkkkkkkkkk',
  '....k..k....',
  '....k..k....',
];
const PROJ_PAL = { k: PX.ink, w: PX.paper, p: PX.purple };

const REEL_SPRITE = [
  '.kkk.',
  'kwwwk',
  'kwkwk',
  'kwwwk',
  '.kkk.',
];
const REEL_PAL = { k: PX.ink, w: PX.stone };

// ── Theater room backdrop ─────────────────────────────────────

function TheaterBackdrop() {
  const wall = '#0d0a1e';
  const floor = '#100d20';
  const curtain = '#3a1a4a';
  const curtainShadow = '#1e0d2b';
  const floorStripe = 'rgba(255,255,255,0.025)';

  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 480 320"
    >
      {/* Wall */}
      <rect width="480" height="256" fill={wall} />
      {/* Floor */}
      <rect y="256" width="480" height="64" fill={floor} />
      {/* Floor perspective lines */}
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1="240" y1="256" x2={i * 160} y2="320" stroke={floorStripe} strokeWidth="1" />
      ))}
      {/* Left curtain */}
      <polygon points="0,0 90,0 60,256 0,256" fill={curtain} />
      <polygon points="0,0 28,0 18,256 0,256" fill={curtainShadow} />
      {/* Right curtain */}
      <polygon points="480,0 390,0 420,256 480,256" fill={curtain} />
      <polygon points="480,0 452,0 462,256 480,256" fill={curtainShadow} />
      {/* Curtain folds — left */}
      {[14, 32, 52, 72].map((x, i) => (
        <line key={i} x1={x} y1="0" x2={x - 9} y2="256" stroke="rgba(0,0,0,0.2)" strokeWidth="2" />
      ))}
      {/* Curtain folds — right */}
      {[408, 428, 448, 466].map((x, i) => (
        <line key={i} x1={x} y1="0" x2={x + 9} y2="256" stroke="rgba(0,0,0,0.2)" strokeWidth="2" />
      ))}
      {/* Valance bar */}
      <rect x="0" y="0" width="480" height="14" fill={curtainShadow} />
      <rect x="0" y="12" width="480" height="3" fill="#5a2870" />

      {/* Projector beam */}
      <defs>
        <linearGradient id="beam" x1="240" y1="0" x2="240" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="rgba(200,180,255,0.20)" />
          <stop offset="100%" stopColor="rgba(200,180,255,0)" />
        </linearGradient>
        <radialGradient id="screenGrad" cx="50%" cy="44%" r="56%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="65%" stopColor="#faf8f2" />
          <stop offset="100%" stopColor="#ede5d5" />
        </radialGradient>
        <radialGradient id="screenVig" cx="50%" cy="50%" r="52%">
          <stop offset="55%" stopColor="rgba(0,0,0,0)" />
          <stop offset="100%" stopColor="rgba(27,21,48,0.22)" />
        </radialGradient>
      </defs>
      <polygon points="240,0 165,216 315,216" fill="url(#beam)" />

      {/* Film sprocket strip — top of screen */}
      {Array.from({ length: 15 }, (_, i) => (
        <rect key={`t${i}`} x={93 + i * 20} y="20" width="8" height="6" rx="1"
          fill="#140f28" stroke="#2d1f55" strokeWidth="0.5" />
      ))}
      {/* Screen frame shadow */}
      <rect x="90" y="26" width="300" height="200" fill="rgba(0,0,0,0.3)" transform="translate(3,3)" />
      {/* Screen frame */}
      <rect x="90" y="26" width="300" height="200" fill="none" stroke={PX.ink} strokeWidth="5" />
      {/* Screen surface */}
      <rect x="92" y="28" width="296" height="196" fill="url(#screenGrad)" />
      {/* Screen vignette */}
      <rect x="92" y="28" width="296" height="196" fill="url(#screenVig)" />
      {/* Film sprocket strip — bottom of screen */}
      {Array.from({ length: 15 }, (_, i) => (
        <rect key={`b${i}`} x={93 + i * 20} y="228" width="8" height="6" rx="1"
          fill="#140f28" stroke="#2d1f55" strokeWidth="0.5" />
      ))}

      {/* Seat rows */}
      {[268, 283, 296, 308].map((y, row) =>
        Array.from({ length: 9 }, (_, i) => (
          <rect key={`${row}-${i}`} x={16 + i * 50} y={y} width="36" height="10" rx="3"
            fill="#1a1035" stroke="#2d1f55" strokeWidth="1" />
        ))
      )}
    </svg>
  );
}

// ── Projector decorations ─────────────────────────────────────

function ProjectorDecor() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 z-20">
        <PixelSprite rows={PROJECTOR_SPRITE} palette={PROJ_PAL} scale={4} title="projector" />
      </div>
      <div aria-hidden className="pointer-events-none absolute z-20" style={{ left: 14, top: 8 }}>
        <PixelSprite rows={REEL_SPRITE} palette={REEL_PAL} scale={4} title="film reel" />
      </div>
      <div aria-hidden className="pointer-events-none absolute z-20" style={{ right: 14, top: 8 }}>
        <PixelSprite rows={REEL_SPRITE} palette={REEL_PAL} scale={4} title="film reel" />
      </div>
    </>
  );
}

// ── Screen overlay — content projected here ───────────────────

export function ProjectScreen({
  children,
  label,
  scroll = true,
}: {
  children: ReactNode;
  label?: string;
  scroll?: boolean;
}) {
  const screenStyle: CSSProperties = {
    background: 'radial-gradient(ellipse 90% 90% at 50% 44%, #ffffff 0%, #faf8f2 60%, #ede5d5 100%)',
    boxShadow: 'inset 0 0 60px rgba(27,21,48,0.14)',
    color: PX.ink,
  };

  return (
    <div
      className="absolute z-10 overflow-hidden"
      style={{
        // Aligned to SVG screen rect: x=90..390 (300px of 480), y=26..226 (200px of 320)
        left: '19.2%', right: '18.8%',
        top: '8.2%', bottom: '29.5%',
      }}
    >
      {/* Film sprocket holes — decorative CSS along top & bottom */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-between px-1"
        style={{ height: 8, background: '#140f28', borderBottom: `1px solid #2d1f55` }}>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} style={{ width: 6, height: 5, marginTop: 1.5, borderRadius: 1, background: '#2a1f40' }} />
        ))}
      </div>

      <div className="relative h-full w-full" style={screenStyle}>
        {/* Label bar */}
        {label && (
          <div
            className="absolute left-0 right-0 z-10 flex items-center justify-center py-0.5"
            style={{
              top: 8,
              background: 'rgba(27,21,48,0.06)',
              borderBottom: '1px solid rgba(27,21,48,0.08)',
            }}
          >
            <span className="font-pixel text-[9px] tracking-[0.3em] uppercase opacity-40">{label}</span>
          </div>
        )}

        <div
          className={`absolute inset-0 ${scroll ? 'overflow-y-auto overscroll-contain' : 'overflow-hidden'}`}
          style={{ top: label ? 22 : 8, bottom: 8 }}
        >
          {children}
        </div>
      </div>

      {/* Sprocket holes — bottom */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-between px-1"
        style={{ height: 8, background: '#140f28', borderTop: `1px solid #2d1f55` }}>
        {Array.from({ length: 18 }, (_, i) => (
          <div key={i} style={{ width: 6, height: 5, marginTop: 1.5, borderRadius: 1, background: '#2a1f40' }} />
        ))}
      </div>
    </div>
  );
}

// ── Full scene wrapper ────────────────────────────────────────

export function ProjectScene({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative w-full overflow-hidden select-none"
      style={{ height: 'calc(100svh - 64px)', background: '#0d0a1e' }}
    >
      <TheaterBackdrop />
      <ProjectorDecor />
      {children}
    </div>
  );
}
