import { PixelSprite, PX } from '@/components/pixel';
import styles from './styles';

/**
 * 18x24 attendee seen from behind on the concourse, head tipped back and one
 * arm raised toward the schedule board hanging above and to the left.
 */
const ROWS = [
  '........kkkkkk....',
  '.......khhhhhhk...',
  '.kk...khhHhhhhhk..',
  'kssk..khHhhhhhhk..',
  'kssk..kshhhhhhhk..',
  '.ktk..kshhhhhhhk..',
  '.kttk..kshhhhhk...',
  '..kttk..kssssk....',
  '...kttkkkkkkkkkkk.',
  '....kttttbbbbtttk.',
  '.....kttbbbbbbttk.',
  '.....kttbboobbttk.',
  '.....kttbbbbbbttk.',
  '.....kttbbbbbbttk.',
  '.....kttkkkkkkttk.',
  '.....ktttttttttsk.',
  '.....kkttttttttkk.',
  '......kppppppppk..',
  '......kppppppppk..',
  '......kpppkkpppk..',
  '......kpppkkpppk..',
  '......kpppkkpppk..',
  '.....kwwwwkkwwwwk.',
  '.....kkkkk..kkkkk.',
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

/** The user's avatar standing in the crowd, flagged with a small "YOU" marker. */
export function Attendee({ className }: { className?: string }) {
  return (
    <div className={`${styles.attendee} ${className ?? ''}`}>
      <span className={`${styles.youTag} font-pixel`} aria-hidden="true">
        YOU
      </span>
      <PixelSprite
        rows={ROWS}
        palette={PALETTE}
        scale={4}
        className={styles.attendeeSprite}
        title="You, in the crowd, looking up at the schedule board"
      />
    </div>
  );
}
