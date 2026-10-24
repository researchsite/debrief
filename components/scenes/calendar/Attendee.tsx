import { PixelSprite, PX } from '@/components/pixel';

/** 16x24 attendee seen from behind, looking up at the billboard. */
const ROWS = [
  '....kkkkkkkk....',
  '...khhhhhhhhk...',
  '..khhHhhhhhhhk..',
  '..khHhhhhhhhhk..',
  '..khhhhhhhhhhk..',
  '..kshhhhhhhhsk..',
  '..kshhhhhhhhsk..',
  '...khhhhhhhhk...',
  '....kssssssk....',
  '..kkttkkkkttkk..',
  '.kttkbbbbbbkttk.',
  '.kttkbbbbbbkttk.',
  '.kttkboooobkttk.',
  '.kttkbbbbbbkttk.',
  '.kttkkkkkkkkttk.',
  '.kskttttttttksk.',
  '.kkkttttttttkkk.',
  '...kppppppppk...',
  '...kppppppppk...',
  '...kpppkkpppk...',
  '...kpppkkpppk...',
  '...kpppkkpppk...',
  '..kwwwwkkwwwwk..',
  '..kkkkk..kkkkk..',
];

const PALETTE = {
  k: PX.ink,
  h: PX.hair,
  H: '#5a4232',
  s: PX.skin,
  t: PX.teal,
  b: PX.orange,
  o: PX.sun,
  p: PX.night,
  w: PX.white,
};

export function Attendee({ className }: { className?: string }) {
  return (
    <PixelSprite
      rows={ROWS}
      palette={PALETTE}
      scale={8}
      className={className}
      title="You, looking at the schedule board"
    />
  );
}
