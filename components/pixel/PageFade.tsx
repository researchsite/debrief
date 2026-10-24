'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/** Fades each new route in from black. */
export function PageFade({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="px-page-fade relative flex-1 flex flex-col">
      {children}
      <div aria-hidden className="px-page-fade-curtain" />
    </div>
  );
}
