'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { TimelineEntry } from '@/lib/graph-writes';
import {
  Attendee,
  Billboard,
  HallBackdrop,
  calendarStyles as styles,
  dedupeEntries,
  groupByDay,
  type BoardState,
} from '@/components/scenes/calendar';

interface TodayApiResponse {
  timeline: TimelineEntry[];
  event: { eventName: string; primaryIntent: string } | null;
}

async function fetchToday(): Promise<TodayApiResponse> {
  const res = await fetch('/api/today', { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET /api/today failed: ${res.status}`);
  return (await res.json()) as TodayApiResponse;
}

export default function TodayPage() {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [event, setEvent] = useState<{ eventName: string; primaryIntent: string } | null>(null);
  const [state, setState] = useState<BoardState>('loading');
  const [sheetOpen, setSheetOpen] = useState(false);

  const [attempt, setAttempt] = useState(0);
  const [loadedAt, setLoadedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchToday()
      .then((data) => {
        if (cancelled) return;
        setTimeline(dedupeEntries(data.timeline ?? []));
        setEvent(data.event ?? null);
        setLoadedAt(Date.now());
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setState('loading');
    setAttempt((n) => n + 1);
  }, []);

  const sections = useMemo(() => groupByDay(timeline, loadedAt), [timeline, loadedAt]);

  return (
    <div className={styles.stage}>
      <HallBackdrop />

      <div className={styles.foreground}>
        <div className={styles.truss} aria-hidden="true" />
        <div className={styles.boardArea}>
          <Billboard state={state} event={event} sections={sections} now={loadedAt} onRetry={retry} />
        </div>
        <Attendee />
      </div>

      {/* Floating "+" capture button with Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger aria-label="Add capture" className={`px-btn ${styles.fab}`}>
          +
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-none border-t-4 border-[var(--px-ink)] bg-[var(--px-cream)] pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-pixel text-lg">Add capture</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <Link
              href="/add-person"
              onClick={() => setSheetOpen(false)}
              className="px-panel flex items-center gap-4 px-4 py-3 text-left hover:bg-[var(--px-sun)]"
            >
              <span className="text-2xl" aria-hidden="true">👤</span>
              <div>
                <p className="font-pixel text-sm">Add Person</p>
                <p className="font-pixel-body text-lg leading-none">Scan QR or enter LinkedIn URL</p>
              </div>
            </Link>
            <Link
              href="/add-talk"
              onClick={() => setSheetOpen(false)}
              className="px-panel flex items-center gap-4 px-4 py-3 text-left hover:bg-[var(--px-sun)]"
            >
              <span className="text-2xl" aria-hidden="true">🎤</span>
              <div>
                <p className="font-pixel text-sm">Add Talk</p>
                <p className="font-pixel-body text-lg leading-none">Notes + ideas from a session</p>
              </div>
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
