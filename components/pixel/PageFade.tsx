'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

function PageFadeInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="px-page-fade relative flex-1 flex flex-col">
      {children}
      <div aria-hidden className="px-page-fade-curtain" />
    </div>
  );
}

/** Fades each new route in from black. Suspense boundary keeps usePathname safe during prerender. */
export function PageFade({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="relative flex-1 flex flex-col">{children}</div>}>
      <PageFadeInner>{children}</PageFadeInner>
    </Suspense>
  );
}
