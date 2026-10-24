import { PixelSprite, PX } from '@/components/pixel';

/** 20x32 three-quarter view of a spiky-haired attendee, hand on chin, gazing up-right. */
const ROWS = [
  '......K...K...K.....',
  '.....KHK.KHK.KHK....',
  '....KHHHKHHHKHHHK...',
  '...KHHHHHHHHHHHHHK..',
  '..KHHHHHHHHHHHHHHK..',
  '..KHHHHHHHHHHHHHHHK.',
  '..KHHHHHHSSSSHHSSK..',
  '..KHHHHSSSSSSSSSSK..',
  '..KHHHSSSSSKWSSKWK..',
  '..KHHSsSSSSKESSKEK..',
  '...KSsSSSSSSSSSSSSK.',
  '...KSSsSSSSSSSSSSK..',
  '....KSSSSSSSSKKSK...',
  '.....KSSSSSSSSKRRK..',
  '......KKSSSSKKRRRK..',
  '.......KSSSK.KRRK...',
  '.....KKTTTTTKKTTK...',
  '....KTTTTTTTTTTTK...',
  '...KTTTTTTTTTTTK....',
  '...KTTtTTTTTTTK.....',
  '...KTTtTTTTTTTK.....',
  '...KTTtTTTTTTTK.....',
  '...KSStTTTTTTTK.....',
  '...KSSKTTTTTTTK.....',
  '....KKKPPPPPPPK.....',
  '.....KPPPPPPPPK.....',
  '.....KPPPKPPPPK.....',
  '.....KPPPKKPPPK.....',
  '.....KPPPK.KPPK.....',
  '.....KPPPK.KPPK.....',
  '....KBBBBK.KBBBBK...',
  '....KKKKKK.KKKKKK...',
];

const PALETTE: Record<string, string> = {
  K: PX.ink,
  H: PX.hair,
  S: PX.skin,
  s: PX.skinShade,
  R: PX.skin,
  W: PX.white,
  E: PX.ink,
  T: PX.purple,
  t: '#6a3fd1',
  P: PX.night,
  B: PX.red,
};

export function ThinkerSprite({ className }: { className?: string }) {
  return <PixelSprite rows={ROWS} palette={PALETTE} scale={10} className={className} title="You, thinking back on the event" />;
}

const DOT_ROWS = ['.KKKK.', 'KWWWWK', 'KWWWWK', 'KWWWWK', 'KWWWWK', '.KKKK.'];

/** A small pixel circle used for the thought-bubble trail. */
export function TrailDot({ className }: { className?: string }) {
  return <PixelSprite rows={DOT_ROWS} palette={{ K: PX.ink, W: PX.paper }} scale={3} className={className} />;
}
