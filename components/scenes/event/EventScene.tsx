'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSceneProgress } from '@/components/pixel/useSceneProgress';
import type { DialSegment, ScreenFn } from './EventDial';
import type { EventData, EventExtraction } from './useEventData';

const EventDial = dynamic(() => import('./EventDial'), {
  ssr: false,
  loading: () => null,
});

const RANGE = 5000;

// Keep in sync with the wall screen's classes: top-10 (40px), h-[38%], w-[min(92%,760px)].
const wallCenterY: ScreenFn = (_w, h) => (40 + h * 0.19) / Math.max(1, h);
const wallWidth: ScreenFn = (w) => Math.min(w * 0.92, 760) / Math.max(1, w);
const PLACEHOLDER_KEY = '__import__';

function mod(n: number, m: number) {
  return ((n % m) + m) % m;
}

function sessionTime(starts: string, ends: string) {
  if (starts && ends) return `${starts} - ${ends}`;
  return starts || ends || 'TBA';
}

function WallContent({
  event,
  loadState,
  loadError,
  onRetry,
  onImport,
  empty,
}: {
  event: EventExtraction | null;
  loadState: EventData['loadState'];
  loadError: string;
  onRetry: () => void;
  onImport: () => void;
  empty: boolean;
}) {
  if (loadState === 'loading') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <div className="px-loader" style={{ background: 'var(--px-sky)' }} />
        <p className="font-pixel text-lg">Warming up the projector…</p>
      </div>
    );
  }
  if (loadState === 'error' && empty) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="font-pixel text-xl text-[var(--px-red)]">! Signal lost</p>
        <p className="font-pixel-body text-xl leading-tight opacity-90 max-w-[40ch] break-words">
          {loadError || 'Could not load events.'}
        </p>
        <button type="button" className="px-btn text-sm" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }
  if (!event) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-4">
        <p className="font-pixel text-xl">{empty ? 'No events yet - import one' : '+ Import event'}</p>
        <p className="font-pixel-body text-xl opacity-80">Paste an event schedule URL to fill the dial.</p>
        <button type="button" className="px-btn text-sm" onClick={onImport}>
          Import Event
        </button>
      </div>
    );
  }
  const meta = [event.event.date, event.event.venue].filter(Boolean).join(' · ');
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 pb-2 mb-2 border-b-2 border-dashed border-[rgba(207,234,255,0.4)]">
        <h2 className="font-pixel text-xl sm:text-2xl leading-tight break-words">{event.event.name}</h2>
        {meta && <p className="font-pixel-body text-lg leading-none opacity-80">{meta}</p>}
      </div>
      {event.sessions.length === 0 ? (
        <p className="font-pixel-body text-xl opacity-80">No sessions found for this event yet.</p>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-1 event-wall-scroll">
          {event.sessions.map((s, i) => (
            <li key={`${s.starts}-${i}`} className="font-pixel-body text-lg sm:text-xl leading-tight flex flex-wrap gap-x-3">
              <span className="text-[var(--px-sun)] whitespace-nowrap">{sessionTime(s.starts, s.ends)}</span>
              <span className="flex-1 min-w-[10ch]">
                {s.title?.trim() || <span className="opacity-60 italic">Untitled session</span>}
                {s.room ? <span className="opacity-70"> · {s.room}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ImportSheet({ data, onClose, onImported }: {
  data: EventData;
  onClose: () => void;
  onImported: (e: EventExtraction) => void;
}) {
  const { url, setUrl, loading, error, handleImport } = data;
  async function submit() {
    const result = await handleImport();
    if (result) onImported(result);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onClose]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-end sm:items-center justify-center bg-[rgba(27,21,48,0.55)] p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" className="px-panel w-full max-w-md p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="import-title" className="font-pixel text-xl">Import Event</h2>
          <button type="button" className="px-chip bg-[var(--px-cream)]" onClick={onClose} disabled={loading} aria-label="Close">
            X
          </button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!loading) void submit();
          }}
        >
          <input
            type="url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 min-w-0 border-4 border-[var(--px-ink)] bg-white px-2 py-1.5 font-pixel-body text-xl outline-none focus:border-[var(--px-purple)]"
            placeholder="https://event-site.com/schedule"
            disabled={loading}
          />
          <button type="submit" className="px-btn shrink-0 text-sm" disabled={loading}>
            {loading ? '…' : 'Import'}
          </button>
        </form>
        {loading && (
          <div className="flex items-center gap-3 font-pixel-body text-xl">
            <span className="px-loader" style={{ width: 14, height: 14 }} />
            Fetching event…
          </div>
        )}
        {error && <p className="font-pixel-body text-xl text-[var(--px-red)]">{error}</p>}
      </div>
    </div>
  );
}

export function EventScene({ data }: { data: EventData }) {
  const { events, loadState, loadError, retryLoad, storedEventUrl, refreshing, handleRefresh, lastRefreshed, setError } = data;
  const [sheetOpen, setSheetOpen] = useState(false);
  const hubAnchor = useRef<HTMLDivElement>(null);

  const segments: DialSegment[] = useMemo(
    () => [
      ...events.map((e, i) => ({ key: `${e.event.name}-${i}`, label: e.event.name || 'Untitled event' })),
      { key: PLACEHOLDER_KEY, label: '+ Import event', placeholder: true },
    ],
    [events],
  );
  const count = segments.length;

  const { ref, value, target, setTarget } = useSceneProgress<HTMLDivElement>({
    min: -RANGE,
    max: RANGE,
    sensitivity: 0.005,
    snap: 1,
    damping: 0.12,
    horizontalTouch: true,
  });

  // value starts at -RANGE; offset so that segment 0 is the initial front wedge.
  const activeIndex = mod(Math.round(value + RANGE), count);
  const settledIndex = mod(Math.round(target + RANGE), count);
  const active = segments[activeIndex];
  const activeEvent = active?.placeholder ? null : events[activeIndex] ?? null;

  const step = useCallback((dir: number) => setTarget((t) => Math.round(t) + dir), [setTarget]);

  const goTo = useCallback(
    (index: number) => {
      setTarget((t) => {
        const cur = mod(Math.round(t + RANGE), count);
        let diff = index - cur;
        if (diff > count / 2) diff -= count;
        if (diff < -count / 2) diff += count;
        return Math.round(t) + diff;
      });
    },
    [setTarget, count],
  );

  const openSheet = useCallback(() => {
    setError('');
    setSheetOpen(true);
  }, [setError]);

  // Keyboard: left/right arrows turn the dial.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheetOpen) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen, step]);

  // Cross-fade the wall content when the active wedge changes.
  const wallKey = active?.key ?? 'none';
  const [shownKey, setShownKey] = useState(wallKey);
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (wallKey === shownKey) return;
    const t1 = setTimeout(() => setFading(true), 0);
    const t2 = setTimeout(() => {
      setShownKey(wallKey);
      setFading(false);
    }, 250);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [wallKey, shownKey]);
  const shownIdx = segments.findIndex((s) => s.key === shownKey);
  const shownEvent = shownIdx >= 0 && !segments[shownIdx].placeholder ? events[shownIdx] ?? null : activeEvent;

  return (
    <div
      className="relative w-full overflow-hidden select-none bg-[var(--px-night)] [&_canvas]:[image-rendering:pixelated]"
      style={{ height: 'calc(100svh - 64px)' }}
      aria-label="Event dial. Use left and right arrows to switch events."
    >
      <div ref={ref} className="absolute inset-0 touch-none">
        <EventDial
          segments={segments}
          value={value + RANGE}
          activeIndex={activeIndex}
          hubAnchor={hubAnchor}
          screenY={wallCenterY}
          screenW={wallWidth}
        />
      </div>

      {/* Hub Import button, pinned to the hub's projected position by the dial */}
      <div ref={hubAnchor} className="absolute left-0 top-0 z-20 opacity-0 transition-opacity will-change-transform">
        <button type="button" className="px-btn whitespace-nowrap text-sm" onClick={openSheet} disabled={data.loading}>
          Import Event
        </button>
      </div>

      {/* Projected wall screen */}
      <div className="absolute left-1/2 -translate-x-1/2 top-10 w-[min(92%,760px)] h-[38%] z-10">
        <div className="event-wall relative h-full p-3 sm:p-4 text-[#eaf6ff] border-4 border-[#cfeaff] overflow-hidden">
          <div
            className="relative z-10 h-full transition-opacity duration-[250ms] ease-out"
            style={{ opacity: fading ? 0 : 1 }}
            aria-live="polite"
          >
            <WallContent
              event={shownEvent}
              loadState={loadState}
              loadError={loadError}
              onRetry={retryLoad}
              onImport={openSheet}
              empty={events.length === 0}
            />
          </div>
          <div aria-hidden className="event-wall-scanlines pointer-events-none absolute inset-0 z-20" />
        </div>
      </div>

      {/* Refresh chip for the stored event */}
      {storedEventUrl && activeEvent && (
        <div className="absolute right-3 top-[calc(38%+52px)] z-20 flex flex-col items-end gap-1">
          <button type="button" className="px-btn text-xs !px-2 !py-1" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh schedule'}
          </button>
          {lastRefreshed && (
            <span className="font-pixel-body text-base text-[#eaf6ff]">
              Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      )}

      {/* Prev / next controls */}
      <div className="absolute bottom-4 inset-x-0 z-20 flex items-center justify-center gap-3 px-4 pointer-events-none">
        <button type="button" className="px-btn pointer-events-auto text-lg !px-3 !py-1" onClick={() => step(-1)} aria-label="Previous event">
          ◀
        </button>
        <div className="px-chip bg-[var(--px-paper)] text-[var(--px-ink)] pointer-events-auto max-w-[55vw] truncate !text-sm !py-1">
          <span className="truncate">{active?.label ?? ''}</span>
          <span className="ml-2 opacity-60 shrink-0">{settledIndex + 1}/{count}</span>
        </div>
        <button type="button" className="px-btn pointer-events-auto text-lg !px-3 !py-1" onClick={() => step(1)} aria-label="Next event">
          ▶
        </button>
      </div>

      {loadState === 'loading' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(27,21,48,0.35)] pointer-events-none">
          <div className="px-panel px-4 py-3 flex items-center gap-3 font-pixel">
            <span className="px-loader" />
            Loading events…
          </div>
        </div>
      )}

      {sheetOpen && (
        <ImportSheet
          data={data}
          onClose={() => setSheetOpen(false)}
          onImported={(imported) => {
            setSheetOpen(false);
            const idx = events.findIndex((e) => e.event.name === imported.event.name);
            goTo(idx === -1 ? events.length : idx);
          }}
        />
      )}

      <style>{`
        .event-wall {
          background: radial-gradient(ellipse at 50% 40%, rgba(120, 190, 255, 0.34), rgba(40, 60, 140, 0.55) 70%, rgba(27, 21, 48, 0.75));
          box-shadow: 0 0 0 4px #1b1530, 0 0 36px 6px rgba(127, 211, 255, 0.45), inset 0 0 40px rgba(127, 211, 255, 0.25);
          text-shadow: 0 0 6px rgba(127, 211, 255, 0.6);
          animation: event-wall-flicker 4s steps(1) infinite;
        }
        .event-wall-scanlines {
          background: repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.06) 0 2px, rgba(0, 0, 0, 0.14) 2px 4px);
        }
        .event-wall-scroll::-webkit-scrollbar { width: 8px; }
        .event-wall-scroll::-webkit-scrollbar-thumb { background: #cfeaff; }
        @keyframes event-wall-flicker {
          0%, 100% { filter: brightness(1); }
          47% { filter: brightness(0.93); }
          48% { filter: brightness(1.04); }
        }
        @media (prefers-reduced-motion: reduce) {
          .event-wall { animation: none; }
        }
      `}</style>
    </div>
  );
}
