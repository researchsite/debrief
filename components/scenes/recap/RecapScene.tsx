import type { CSSProperties, ReactNode } from 'react';
import { PX } from '@/components/pixel';
import { ThinkerSprite, TrailDot } from './ThinkerSprite';

/** Clip path with two-step pixel corners of `s` px. */
function stepped(s: number): string {
  const a = `${s}px`;
  const b = `${s * 2}px`;
  const ra = `calc(100% - ${a})`;
  const rb = `calc(100% - ${b})`;
  return `polygon(0 ${b}, ${a} ${b}, ${a} ${a}, ${b} ${a}, ${b} 0, ${rb} 0, ${rb} ${a}, ${ra} ${a}, ${ra} ${b}, 100% ${b}, 100% ${rb}, ${ra} ${rb}, ${ra} ${ra}, ${rb} ${ra}, ${rb} 100%, ${b} 100%, ${b} ${ra}, ${a} ${ra}, ${a} ${rb}, 0 ${rb})`;
}

/** Cloud puffs around the bubble body; merged outline is drawn ink-first, paper-second. */
const PUFFS: CSSProperties[] = [
  { left: '6%', top: -14, width: '22%', height: 44 },
  { left: '34%', top: -20, width: '26%', height: 50 },
  { left: '66%', top: -12, width: '24%', height: 40 },
  { left: '10%', bottom: -14, width: '26%', height: 44 },
  { left: '50%', bottom: -12, width: '30%', height: 40 },
  { left: -12, top: '18%', width: 40, height: '26%' },
  { left: -14, top: '58%', width: 44, height: '24%' },
  { right: -12, top: '12%', width: 40, height: '30%' },
  { right: -14, top: '55%', width: 44, height: '28%' },
];

const BODY: CSSProperties = { inset: 0 };

function CloudShapes() {
  const shapes = [BODY, ...PUFFS];
  return (
    <div aria-hidden className="absolute inset-0" style={{ filter: `drop-shadow(6px 6px 0 ${PX.ink})` }}>
      {shapes.map((s, i) => (
        <div key={`ink-${i}`} className="absolute" style={{ ...s, background: PX.ink, clipPath: stepped(8) }} />
      ))}
      {shapes.map((s, i) => (
        <div key={`paper-${i}`} className="absolute" style={{ ...s, clipPath: stepped(8) }}>
          <div className="absolute inset-[4px]" style={{ background: PX.paper, clipPath: stepped(6) }} />
        </div>
      ))}
    </div>
  );
}

const HALFTONE: CSSProperties = {
  backgroundColor: PX.cream,
  backgroundImage: `radial-gradient(circle, rgba(255, 122, 182, 0.55) 2px, transparent 2.6px), radial-gradient(circle, rgba(127, 211, 255, 0.45) 2px, transparent 2.6px)`,
  backgroundSize: '14px 14px, 14px 14px',
  backgroundPosition: '0 0, 7px 7px',
};

/** Static comic stage: a pixel attendee bottom-left thinking a big recap bubble. */
export function RecapScene({ children }: { children: ReactNode }) {
  return (
    <div className="relative w-full" style={HALFTONE}>
      {/* Floor */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-5"
        style={{ background: PX.purple, borderTop: `4px solid ${PX.ink}` }}
      />
      <div
        className="relative mx-auto w-full max-w-[1000px] overflow-hidden"
        style={{ height: 'calc(100svh - 4rem)', minHeight: 560 }}
      >
        {/* Thinker */}
        <ThinkerSprite className="absolute bottom-4 left-2 h-auto w-[90px] sm:left-6 sm:w-[180px]" />

        {/* Thought trail: phone */}
        <TrailDot className="absolute left-[84px] bottom-[160px] h-auto w-[10px] sm:hidden" />
        <TrailDot className="absolute left-[98px] bottom-[176px] h-auto w-[16px] sm:hidden" />
        {/* Thought trail: desktop */}
        <TrailDot className="absolute hidden sm:block left-[182px] bottom-[312px] h-auto w-[10px]" />
        <TrailDot className="absolute hidden sm:block left-[194px] bottom-[330px] h-auto w-[16px]" />
        <TrailDot className="absolute hidden sm:block left-[206px] bottom-[354px] h-auto w-[22px]" />

        {/* Bubble */}
        <div className="absolute left-5 right-5 top-6 bottom-[212px] sm:left-[236px] sm:right-8 sm:top-10 sm:bottom-12">
          <CloudShapes />
          <div className="absolute inset-[6px] overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 sm:py-5 text-[color:var(--px-ink)]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
