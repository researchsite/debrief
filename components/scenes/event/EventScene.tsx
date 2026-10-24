'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSceneProgress } from '@/components/pixel/useSceneProgress';
import type { DialSegment, ScreenBox } from './EventDial';
import type { EventData, EventExtraction } from './useEventData';

const EventDial = dynamic(() => import('./EventDial'), {
  ssr: false,
  loading: () => null,
});

const RANGE = 5000;
/** The dial always shows at least this many wedges so it reads as a disc. */
const MIN_SLOTS = 6;

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
  portrait,
}: {
  event: EventExtraction | null;
  loadState: EventData['loadState'];
  loadError: string;
  onRetry: () => void;
  onImport: () => void;
  empty: boolean;
  portrait: boolean;
}) {
  if (loadState === 'loading') {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <div className="px-loader" style={{ background: 'var(--px-purple)' }} />
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
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-4">
        <p className={`font-pixel ${portrait ? 'text-lg' : 'text-2xl'}`}>{empty ? 'No events yet' : 'This slot is empty'}</p>
        <p className={`font-pixel-body ${portrait ? 'text-lg' : 'text-xl'} leading-tight opacity-75 max-w-[34ch]`}>
          Paste an event schedule URL and its agenda will be projected here.
        </p>
        <button type="button" className="px-btn text-sm mt-1" onClick={onImport}>
          + Import Event
        </button>
      </div>
    );
  }
  const meta = [event.event.date, event.event.venue].filter(Boolean).join(' · ');
  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="shrink-0 pb-1.5 mb-2 border-b-2 border-[rgba(27,21,48,0.18)]">
        <p className="font-pixel text-[10px] tracking-[0.2em] uppercase opacity-50 leading-none mb-1">Now showing</p>
        <h2 className={`font-pixel ${portrait ? 'text-lg' : 'text-2xl'} leading-tight break-words`}>{event.event.name}</h2>
        {meta && <p className={`font-pixel-body ${portrait ? 'text-base' : 'text-lg'} leading-none opacity-70`}>{meta}</p>}
      </div>
      {event.sessions.length === 0 ? (
        <p className="font-pixel-body text-xl opacity-70">No sessions found for this event yet.</p>
      ) : (
        <ul
          className={`flex-1 min-h-0 overflow-y-auto pr-2 event-wall-scroll touch-pan-y ${portrait ? 'space-y-1.5' : 'space-y-1'}`}
        >
          {event.sessions.map((s, i) => (
            <li
              key={`${s.starts}-${i}`}
              className={`font-pixel-body leading-tight ${portrait ? 'text-base' : 'text-xl grid grid-cols-[minmax(0,auto)_1fr] gap-x-4'}`}
            >
              <span className={`text-[var(--px-purple)] whitespace-nowrap ${portrait ? 'block text-sm leading-none' : ''}`}>
                {sessionTime(s.starts, s.ends)}
              </span>
              <span className="min-w-0 break-words">
                {s.title?.trim() || <span className="opacity-50 italic">Untitled session</span>}
                {s.room ? <span className="opacity-55"> · {s.room}</span> : null}
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

  // Real events first, then empty slots up to MIN_SLOTS. Events are never duplicated.
  const segments: DialSegment[] = useMemo(() => {
    const list: DialSegment[] = events.map((e, i) => ({ key: `${e.event.name}-${i}`, label: e.event.name || 'Untitled event' }));
    for (let i = list.length; i < MIN_SLOTS; i++) list.push({ key: `__empty__${i}`, label: 'Empty slot', empty: true });
    return list;
  }, [events]);
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
  const activeEvent = active?.empty ? null : events[activeIndex] ?? null;

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
  const shownEvent = shownIdx >= 0 && !segments[shownIdx].empty ? events[shownIdx] ?? null : activeEvent;

  // Agenda box: positioned every frame by the dial so it sits exactly on the screen mesh.
  const screenRef = useRef<HTMLDivElement>(null);
  const [screenBox, setScreenBox] = useState<ScreenBox>({ width: 0, height: 0, portrait: false });
  const onScreenBox = useCallback((b: ScreenBox) => setScreenBox(b), []);
  const compact = screenBox.portrait || screenBox.width < 440;

  return (
    <div
      className="relative w-full overflow-hidden select-none bg-[var(--px-night)]"
      style={{ height: 'calc(100svh - 64px)' }}
      aria-label="Event dial. Use left and right arrows to switch events."
    >
      <div ref={ref} className="absolute inset-0 touch-none">
        <EventDial
          segments={segments}
          value={value + RANGE}
          activeIndex={activeIndex}
          screenRef={screenRef}
          onScreenBox={onScreenBox}
        />
      </div>

      {/* Agenda projected on the screen (DOM, aligned to the 3D screen by the dial) */}
      {screenBox.width > 0 && (
        <div
          ref={screenRef}
          data-w={screenBox.width}
          data-h={screenBox.height}
          className="event-screen absolute left-0 top-0 z-10 origin-top-left text-[var(--px-ink)] invisible"
          style={{ width: screenBox.width, height: screenBox.height }}
        >
          <div
            className={`relative h-full ${compact ? 'px-3 py-2.5' : 'px-5 py-4'} transition-opacity duration-[250ms] ease-out`}
            style={{ opacity: fading && wallKey !== shownKey ? 0 : 1 }}
            aria-live="polite"
          >
            <WallContent
              event={shownEvent}
              loadState={loadState}
              loadError={loadError}
              onRetry={retryLoad}
              onImport={openSheet}
              empty={events.length === 0}
              portrait={compact}
            />
          </div>
        </div>
      )}

      {/* Import button, on the right side of the stage */}
      <div className="absolute right-3 bottom-20 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 z-20">
        <button
          type="button"
          className="px-btn whitespace-nowrap text-sm flex items-center gap-2 shadow-lg"
          onClick={openSheet}
          disabled={data.loading}
        >
          <span aria-hidden className="text-lg leading-none">+</span>
          <span className="sm:hidden">Import</span>
          <span className="hidden sm:inline">Import Event</span>
        </button>
      </div>

      {/* Refresh chip for the stored event */}
      {storedEventUrl && activeEvent && (
        <div className="absolute left-3 top-2 z-20 flex flex-col items-start gap-1">
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
          <span className={`truncate ${active?.empty ? 'opacity-60' : ''}`}>{active?.label ?? ''}</span>
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
        .event-screen {
          background: radial-gradient(ellipse 70% 75% at 50% 46%, #ffffff 0%, #fbfaf6 45%, #ece8df 80%, #ddd8cd 100%);
          box-shadow: inset 0 0 60px rgba(27, 21, 48, 0.12);
        }
        .event-wall-scroll::-webkit-scrollbar { width: 6px; }
        .event-wall-scroll::-webkit-scrollbar-thumb { background: rgba(27, 21, 48, 0.25); border-radius: 3px; }
      `}</style>
    </div>
  );
}
