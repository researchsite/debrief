import type { CSSProperties } from 'react';
import { PixelSprite, PX } from '@/components/pixel';

/** One attendee: hair, face, shirt and a lanyard badge. */
const PERSON = [
  '..OOOO..',
  '.OhhhhO.',
  'OhhhhhhO',
  'OhsssshO',
  'OssssssO',
  '.OssssO.',
  '..OssO..',
  '.OttttO.',
  'OttwtttO',
  'OttbbttO',
  'OttbbttO',
  'OttttttO',
];

const HAIR = [PX.hair, '#1b1530', '#c9772f', '#f2d16b', '#7a4a2a', '#5b3a8a', '#d94f6b'];
const SKIN = [PX.skin, '#c98a5a', '#8a5a3a', '#f7d2b0', '#a8704a'];
const SHIRT = [PX.teal, PX.orange, PX.purple, PX.grass, PX.pink, PX.blue, PX.sun, PX.red, '#f4f4f4'];

const CROWD = Array.from({ length: 34 }, (_, i) => ({
  hair: HAIR[(i * 5) % HAIR.length],
  skin: SKIN[(i * 3) % SKIN.length],
  shirt: SHIRT[(i * 7) % SHIRT.length],
  lift: [0, 2, 1, 3, 0, 1, 2][i % 7],
}));

const LIGHT_COLORS = [PX.sun, PX.pink, PX.teal, PX.orange, PX.grass, PX.white];

const BOOTHS: { label: string; sub: string; color: string; style: CSSProperties }[] = [
  { label: 'GRAPH', sub: 'DB', color: PX.teal, style: { left: '2%', top: '22%' } },
  { label: 'AI', sub: 'LAB', color: PX.pink, style: { left: '6%', top: '48%' } },
  { label: 'PTC', sub: '2026', color: PX.sun, style: { right: '0.5%', top: '18%' } },
  { label: 'DATA', sub: 'WEB', color: PX.orange, style: { right: '0.5%', top: '46%' } },
];

/** Busy tech-conference hall behind the camera: banner, string lights, spotlights, booths and a crowd. */
export function ConferenceBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: 'linear-gradient(#4b3f99 0 55%, #5d51b3 55% 78%, #3a2f7a 78% 100%)' }}>
      {/* Wall panel seams */}
      <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(to right, rgba(27,21,48,0.25) 3px, transparent 3px)', backgroundSize: '120px 100%' }} />

      {/* Spotlight cones */}
      {['18%', '50%', '82%'].map((left) => (
        <div key={left} className="absolute top-0" style={{ left, width: 220, height: '85%', transform: 'translateX(-50%)', background: 'linear-gradient(rgba(255,233,140,0.32), rgba(255,233,140,0))', clipPath: 'polygon(44% 0, 56% 0, 100% 100%, 0 100%)' }} />
      ))}

      {/* String lights */}
      <div className="absolute inset-x-0 top-1 flex justify-around">
        {Array.from({ length: 28 }, (_, i) => (
          <span key={i} className="inline-block h-2 w-2 sm:h-3 sm:w-3" style={{ background: LIGHT_COLORS[i % LIGHT_COLORS.length], border: `2px solid ${PX.ink}`, marginTop: [0, 4, 7, 4][i % 4] }} />
        ))}
      </div>

      {/* Sponsor roll-up banners */}
      {BOOTHS.map((booth) => (
        <div key={booth.label} className="font-pixel absolute hidden w-16 flex-col items-center gap-1 py-2 text-center text-[10px] sm:flex lg:w-20 lg:text-xs" style={{ ...booth.style, background: booth.color, color: PX.ink, border: `3px solid ${PX.ink}`, boxShadow: `4px 4px 0 ${PX.ink}` }}>
          <span>{booth.label}</span>
          <span className="text-[8px] lg:text-[10px]">{booth.sub}</span>
          <span className="mt-1 h-6 w-8 border-2" style={{ borderColor: PX.ink, background: PX.white }} />
        </div>
      ))}

      {/* Crowd */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center">
        {CROWD.map((p, i) => (
          <PixelSprite
            key={i}
            rows={PERSON}
            palette={{ O: PX.ink, h: p.hair, s: p.skin, t: p.shirt, w: PX.white, b: PX.white }}
            className="-mx-0.5 shrink-0"
            style={{ width: 'calc(var(--u) * 8)', height: 'calc(var(--u) * 12)', marginBottom: `calc(var(--u) * ${-p.lift})` }}
          />
        ))}
      </div>
    </div>
  );
}
