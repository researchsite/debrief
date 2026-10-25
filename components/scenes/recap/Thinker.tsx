import { useId } from 'react';

/** A smooth, softly shaded attendee in a hoodie with a lanyard badge, hand on chin, gazing up-right. */
export function Thinker({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  const g = (name: string) => `${id}-${name}`;
  const url = (name: string) => `url(#${g(name)})`;

  return (
    <svg viewBox="0 0 220 320" className={className} role="img" aria-label="You, thinking back on the event">
      <defs>
        <radialGradient id={g('skin')} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor="#ffe1c4" />
          <stop offset="55%" stopColor="#f5c49a" />
          <stop offset="100%" stopColor="#dc9f72" />
        </radialGradient>
        <linearGradient id={g('skinNeck')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d99a6c" />
          <stop offset="100%" stopColor="#efbb8f" />
        </linearGradient>
        <linearGradient id={g('hair')} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#6b4a34" />
          <stop offset="60%" stopColor="#3b2a20" />
          <stop offset="100%" stopColor="#24170f" />
        </linearGradient>
        <linearGradient id={g('hoodie')} x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#a985ff" />
          <stop offset="55%" stopColor="#7c4dff" />
          <stop offset="100%" stopColor="#5530c9" />
        </linearGradient>
        <linearGradient id={g('sleeve')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8d62ff" />
          <stop offset="100%" stopColor="#5f37d8" />
        </linearGradient>
        <linearGradient id={g('jeans')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#3d4f8f" />
          <stop offset="100%" stopColor="#27325f" />
        </linearGradient>
        <linearGradient id={g('shoe')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#d9d4e8" />
        </linearGradient>
        <filter id={g('blur')} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id={g('soft')} x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1b1530" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Ground shadow */}
      <ellipse cx="110" cy="306" rx="68" ry="9" fill="#140c28" opacity="0.45" filter={url('blur')} />

      {/* Legs */}
      <rect x="80" y="228" width="26" height="72" rx="12" fill={url('jeans')} />
      <rect x="113" y="228" width="26" height="72" rx="12" fill={url('jeans')} />
      {/* Shoes */}
      <path d="M74 300 q0 -12 14 -12 h14 q10 0 12 12 z" fill={url('shoe')} />
      <path d="M108 300 q0 -12 14 -12 h14 q14 0 16 12 z" fill={url('shoe')} />
      <rect x="74" y="298" width="40" height="5" rx="2.5" fill="#ff5c6c" />
      <rect x="108" y="298" width="44" height="5" rx="2.5" fill="#ff5c6c" />

      {/* Back arm (hanging) */}
      <path d="M68 172 C58 196 58 220 64 240" stroke={url('sleeve')} strokeWidth="22" strokeLinecap="round" fill="none" />
      <circle cx="65" cy="246" r="10" fill={url('skin')} />

      {/* Torso */}
      <path
        d="M62 242 C58 204 60 174 78 160 Q110 146 142 160 C160 174 162 204 158 242 Q110 252 62 242 Z"
        fill={url('hoodie')}
        filter={url('soft')}
      />
      {/* Hoodie pocket and hem */}
      <path d="M84 222 Q110 214 136 222 L132 240 Q110 244 88 240 Z" fill="#6a3fe0" opacity="0.55" />
      <path d="M62 238 Q110 250 158 238" stroke="#4a28b5" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.6" />
      {/* Hood collar */}
      <path d="M84 158 Q110 176 136 158 Q130 150 110 150 Q90 150 84 158 Z" fill="#5a33cf" />

      {/* Neck */}
      <rect x="99" y="128" width="22" height="30" rx="10" fill={url('skinNeck')} />

      {/* Lanyard */}
      <path d="M100 156 L88 198" stroke="#ffd23f" strokeWidth="4" strokeLinecap="round" />
      <path d="M120 156 L94 198" stroke="#f5b800" strokeWidth="4" strokeLinecap="round" />
      {/* Badge */}
      <g transform="rotate(-6 90 212)">
        <rect x="76" y="196" width="28" height="34" rx="5" fill="#ffffff" filter={url('soft')} />
        <rect x="76" y="196" width="28" height="9" rx="4" fill="#ff7ab6" />
        <rect x="76" y="201" width="28" height="4" fill="#ff7ab6" />
        <circle cx="90" cy="213" r="4" fill="#d6cdf0" />
        <rect x="81" y="220" width="18" height="2.6" rx="1.3" fill="#a79fc4" />
        <rect x="84" y="224.5" width="12" height="2.2" rx="1.1" fill="#cfc8e4" />
      </g>

      {/* Head */}
      {/* Ear */}
      <ellipse cx="73" cy="104" rx="9" ry="12" fill="#e6aa7c" />
      <path d="M72 98 q4 6 0 12" stroke="#c98a5e" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="114" cy="96" rx="43" ry="47" fill={url('skin')} />
      {/* Cheek shade toward the far side */}
      <ellipse cx="146" cy="110" rx="8" ry="6" fill="#ff8f9e" opacity="0.32" />
      <ellipse cx="96" cy="118" rx="10" ry="6.5" fill="#ff8f9e" opacity="0.3" />

      {/* Hair */}
      <path
        d="M70 104 C60 64 82 38 116 40 C146 42 166 62 158 90 C148 76 130 70 114 74 C100 78 88 88 79 106 Z"
        fill={url('hair')}
      />
      <path d="M90 84 C96 62 124 54 146 66 C128 64 110 70 100 86 Z" fill={url('hair')} />
      <path d="M116 44 C132 40 150 50 152 64 C144 56 130 52 118 54 Z" fill="#8a6247" opacity="0.55" />

      {/* Eyebrows: one lifted, thoughtful */}
      <path d="M100 82 Q108 77 116 80" stroke="#3b2a20" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <path d="M130 76 Q139 70 148 76" stroke="#3b2a20" strokeWidth="3.4" strokeLinecap="round" fill="none" />

      {/* Eyes looking up-right */}
      <ellipse cx="110" cy="96" rx="6.2" ry="7.4" fill="#ffffff" />
      <ellipse cx="139" cy="94" rx="5.6" ry="7" fill="#ffffff" />
      <circle cx="112.5" cy="93" r="4.2" fill="#2a1d14" />
      <circle cx="141" cy="91" r="3.9" fill="#2a1d14" />
      <circle cx="114" cy="91.4" r="1.4" fill="#ffffff" />
      <circle cx="142.4" cy="89.6" r="1.3" fill="#ffffff" />

      {/* Nose */}
      <path d="M128 102 q4 6 -1 9" stroke="#c98a5e" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      {/* Mouth: small sideways "hmm" */}
      <path d="M118 123 Q126 127 134 121" stroke="#9c4a3c" strokeWidth="2.6" strokeLinecap="round" fill="none" />

      {/* Front arm: elbow low, hand on chin */}
      <path d="M152 168 C164 188 160 210 146 220" stroke={url('sleeve')} strokeWidth="24" strokeLinecap="round" fill="none" />
      <path d="M146 220 C138 196 134 170 132 152" stroke="#7c4dff" strokeWidth="21" strokeLinecap="round" fill="none" />
      <path d="M143 214 C137 194 134 174 133 158" stroke="#a985ff" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.5" />
      {/* Cuff */}
      <rect x="121" y="146" width="23" height="9" rx="4.5" fill="#5a33cf" transform="rotate(-6 132 150)" />
      {/* Hand: loose fist under the chin, index finger along the jaw */}
      <ellipse cx="131" cy="138" rx="12" ry="10.5" fill={url('skin')} />
      <path d="M121 134 Q128 128 138 131" stroke="#d9966a" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      <path d="M122 139 Q129 135 139 137" stroke="#d9966a" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.8" />
      <path d="M139 133 C145 130 148 125 148 119" stroke="#d9966a" strokeWidth="8" strokeLinecap="round" fill="none" />
      <path d="M139 133 C145 130 148 125 148 119" stroke="#f7caa0" strokeWidth="5.6" strokeLinecap="round" fill="none" />
    </svg>
  );
}
