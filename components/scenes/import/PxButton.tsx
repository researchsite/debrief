import type { ButtonHTMLAttributes } from 'react';
import { PX } from '@/components/pixel';

const VARIANT_BG = {
  primary: PX.sun,
  secondary: PX.white,
  success: PX.grass,
  ghost: 'transparent',
} as const;

export interface PxButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_BG;
  size?: 'sm' | 'md';
}

/** Chunky pixel button built on the shared .px-btn class. */
export function PxButton({ variant = 'primary', size = 'md', className = '', style, type = 'button', ...props }: PxButtonProps) {
  return (
    <button
      type={type}
      className={`px-btn inline-flex items-center justify-center gap-2 ${size === 'sm' ? 'text-xs' : 'text-sm'} ${className}`}
      style={{
        background: VARIANT_BG[variant],
        ...(size === 'sm' ? { padding: '0.25rem 0.6rem' } : null),
        ...(variant === 'ghost' ? { boxShadow: 'none', borderStyle: 'dashed', borderWidth: 2 } : null),
        ...style,
      }}
      {...props}
    />
  );
}
