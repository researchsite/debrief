'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'debrief:view-mode';

/** Reads/writes the global classic/scene view preference from localStorage. */
export function useViewMode() {
  const [classic, setClassic] = useState(false);

  useEffect(() => {
    setClassic(localStorage.getItem(STORAGE_KEY) === 'classic');
    // React to changes from other tabs / other pages in the same session
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY) setClassic(e.newValue === 'classic');
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function toggle() {
    setClassic((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, next ? 'classic' : 'dial');
      // Notify other open pages in the same origin
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: next ? 'classic' : 'dial' }));
      return next;
    });
  }

  return { classic, toggle } as const;
}
