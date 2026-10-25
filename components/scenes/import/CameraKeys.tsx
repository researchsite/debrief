import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { PX } from '@/components/pixel';

const KEY_STYLE: CSSProperties = {
  background: '#4a4562',
  color: PX.white,
  border: `3px solid ${PX.ink}`,
  boxShadow: `inset 0 3px 0 #6a6488, inset 0 -4px 0 #2a2639, 0 4px 0 ${PX.ink}`,
  padding: 'calc(var(--u) * 1) calc(var(--u) * 1.25)',
};

function KeyFace({ icon, accent, label }: { icon: ReactNode; accent: string; label: string }) {
  return (
    <>
      {/* The icon is part of the accessible name, so only the main key's name starts with "Import". */}
      <span
        className="flex shrink-0 items-center justify-center text-base leading-none sm:text-lg"
        style={{ width: 'calc(var(--u) * 6)', height: 'calc(var(--u) * 6)', background: accent, border: `2px solid ${PX.ink}`, boxShadow: 'inset 0 -3px 0 rgba(0,0,0,0.25)' }}
      >
        {icon}
      </span>
      <span className="font-pixel min-w-0 text-[9px] leading-snug sm:text-[11px] lg:text-xs">{label}</span>
    </>
  );
}

const KEY_CLASS = 'imp-key flex w-full min-w-0 flex-1 items-center gap-2 text-left';

interface CamKeyProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: ReactNode;
  accent: string;
  label: string;
}

/** A labeled physical camera button. */
export function CamKey({ icon, accent, label, className = '', style, type = 'button', ...props }: CamKeyProps) {
  return (
    <button type={type} className={`${KEY_CLASS} ${className}`} style={{ ...KEY_STYLE, ...style }} {...props}>
      <KeyFace icon={icon} accent={accent} label={label} />
    </button>
  );
}

/** Stepped-octagon clip so the big key reads as a round pixel button. */
const ROUND = 'polygon(30% 0, 70% 0, 70% 6%, 85% 6%, 85% 15%, 94% 15%, 94% 30%, 100% 30%, 100% 70%, 94% 70%, 94% 85%, 85% 85%, 85% 94%, 70% 94%, 70% 100%, 30% 100%, 30% 94%, 15% 94%, 15% 85%, 6% 85%, 6% 70%, 0 70%, 0 30%, 6% 30%, 6% 15%, 15% 15%, 15% 6%, 30% 6%)';

/** The big round main action key, styled like a camera's OK / shutter button. */
export function BigKey({ children, className = '', disabled, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <div className={`relative aspect-square ${className}`} style={{ clipPath: ROUND, background: PX.ink, padding: 4 }}>
      <div className="h-full w-full" style={{ clipPath: ROUND, background: '#141020', padding: 'calc(var(--u) * 1)' }}>
        <button
          type={type}
          disabled={disabled}
          className="imp-key font-pixel flex h-full w-full flex-col items-center justify-center gap-1 text-center text-[11px] leading-tight sm:text-sm"
          style={{
            clipPath: ROUND,
            background: disabled ? '#6b6680' : PX.red,
            color: PX.white,
            boxShadow: `inset 0 calc(var(--u) * 1) 0 rgba(255,255,255,0.28), inset 0 calc(var(--u) * -1.2) 0 rgba(0,0,0,0.3)`,
            textShadow: `2px 2px 0 ${PX.ink}`,
          }}
          {...props}
        >
          {children}
        </button>
      </div>
    </div>
  );
}
