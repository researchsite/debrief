import { useId } from 'react';
import styles from './styles';

/**
 * The user's avatar, seen from behind on the concourse: hoodie and backpack,
 * head tipped back and one arm raised toward the schedule board hanging up
 * and to the right. Smooth shading via SVG gradients.
 */
export function Attendee({ className }: { className?: string }) {
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  return (
    <div className={`${styles.attendee} ${className ?? ''}`}>
      <span className={styles.youTag} aria-hidden="true">
        YOU
      </span>
      <svg
        className={styles.attendeeSprite}
        viewBox="0 0 124 200"
        role="img"
        aria-label="You, in the crowd, looking up at the schedule board"
      >
        <defs>
          <linearGradient id={id('jeans')} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#3a4c86" />
            <stop offset="1" stopColor="#1d2650" />
          </linearGradient>
          <linearGradient id={id('hoodie')} x1="0" x2="1" y1="0" y2="0.35">
            <stop offset="0" stopColor="#4fe0d2" />
            <stop offset="0.5" stopColor="#22c3b5" />
            <stop offset="1" stopColor="#13867c" />
          </linearGradient>
          <linearGradient id={id('sleeve')} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#39d2c4" />
            <stop offset="1" stopColor="#159085" />
          </linearGradient>
          <linearGradient id={id('pack')} x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#ffb071" />
            <stop offset="0.55" stopColor="#ff8c42" />
            <stop offset="1" stopColor="#d9692c" />
          </linearGradient>
          <radialGradient id={id('hair')} cx="0.38" cy="0.3" r="0.75">
            <stop offset="0" stopColor="#6b4a32" />
            <stop offset="0.6" stopColor="#3b2a20" />
            <stop offset="1" stopColor="#24180f" />
          </radialGradient>
          <radialGradient id={id('skin')} cx="0.35" cy="0.35" r="0.8">
            <stop offset="0" stopColor="#f8d1aa" />
            <stop offset="1" stopColor="#d99a6c" />
          </radialGradient>
          <radialGradient id={id('shadow')} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(50,24,20,0.45)" />
            <stop offset="1" stopColor="rgba(50,24,20,0)" />
          </radialGradient>
        </defs>

        <ellipse cx="58" cy="192" rx="40" ry="7" fill={url('shadow')} />

        {/* Legs and sneakers */}
        <rect x="38" y="126" width="18" height="62" rx="9" fill={url('jeans')} />
        <rect x="58" y="126" width="18" height="62" rx="9" fill={url('jeans')} />
        <rect x="34" y="180" width="24" height="12" rx="6" fill="#f4f1ea" />
        <rect x="56" y="180" width="24" height="12" rx="6" fill="#f4f1ea" />
        <rect x="34" y="188" width="24" height="4" rx="2" fill="#bdb6c9" />
        <rect x="56" y="188" width="24" height="4" rx="2" fill="#bdb6c9" />

        {/* Left arm hanging */}
        <g transform="rotate(8 31 76)">
          <rect x="24" y="72" width="15" height="54" rx="7.5" fill={url('sleeve')} />
          <circle cx="31.5" cy="128" r="6.5" fill={url('skin')} />
        </g>

        {/* Hoodie body */}
        <path
          d="M30 84 Q30 66 46 64 L70 64 Q86 66 86 84 L88 128 Q88 142 75 142 L41 142 Q28 142 28 128 Z"
          fill={url('hoodie')}
        />
        <rect x="29" y="131" width="59" height="11" rx="5.5" fill="#13867c" opacity="0.55" />

        {/* Right arm raised toward the board */}
        <g transform="rotate(38 80 76)">
          <rect x="73" y="22" width="15" height="58" rx="7.5" fill={url('sleeve')} />
          <rect x="73" y="22" width="15" height="9" rx="4.5" fill="#13867c" opacity="0.6" />
          <circle cx="80.5" cy="19" r="7" fill={url('skin')} />
        </g>

        {/* Backpack */}
        <path d="M43 79 L39 66" stroke="#c35e25" strokeWidth="5" strokeLinecap="round" />
        <path d="M73 79 L77 66" stroke="#c35e25" strokeWidth="5" strokeLinecap="round" />
        <rect x="38" y="76" width="40" height="48" rx="13" fill={url('pack')} />
        <rect x="44" y="99" width="28" height="19" rx="7" fill="#d9692c" />
        <rect x="44" y="99" width="28" height="4" rx="2" fill="#ffc08f" opacity="0.7" />
        <circle cx="66" cy="84" r="2.2" fill="#ffd23f" />

        {/* Hood bunched behind the neck */}
        <ellipse cx="58" cy="65" rx="18" ry="8" fill="#1a9e93" />
        <rect x="51" y="50" width="14" height="14" rx="6" fill="#d99a6c" />

        {/* Head tipped back, turned slightly right */}
        <ellipse cx="78" cy="42" rx="4" ry="5.5" fill={url('skin')} />
        <ellipse cx="59" cy="38" rx="19.5" ry="19" fill={url('hair')} />
        <path d="M46 28 Q56 20 68 25" stroke="#8a6446" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.7" />
      </svg>
    </div>
  );
}
