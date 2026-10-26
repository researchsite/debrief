'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const boardRef = useRef<HTMLDivElement>(null);

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

  const captures = useMemo(() => timeline.filter((e) => e.type !== 'session'), [timeline]);
  const schedule = useMemo(() => timeline.filter((e) => e.type === 'session'), [timeline]);

  const scheduleSections = useMemo(
    () => (schedule.length > 0 ? [{ key: 'schedule', label: "Today's Schedule", entries: schedule }] : []),
    [schedule],
  );
  const sections = useMemo(
    () => [...scheduleSections, ...groupByDay(captures, loadedAt)],
    [scheduleSections, captures, loadedAt],
  );

  return (
    <div className={styles.stage}>
      <HallBackdrop boardRef={boardRef} />

      <div className={styles.foreground}>
        <div ref={boardRef} className={styles.boardArea}>
          <Billboard state={state} event={event} sections={sections} now={loadedAt} onRetry={retry} />
        </div>
        <Attendee />
      </div>

      {/* Floating "+" capture button with Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger aria-label="Add capture" className={styles.fab}>
          +
        </SheetTrigger>
        <SheetContent side="bottom" className={`${styles.sheet} pb-8`}>
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg font-semibold">Add capture</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <Link
              href="/add-person"
              onClick={() => setSheetOpen(false)}
              className={styles.sheetCard}
            >
              <span className="text-2xl" aria-hidden="true">👤</span>
              <div>
                <p className="text-sm font-semibold">Add Person</p>
                <p className="text-sm text-[#5b5577]">Scan QR or enter LinkedIn URL</p>
              </div>
            </Link>
            <Link
              href="/add-talk"
              onClick={() => setSheetOpen(false)}
              className={styles.sheetCard}
            >
              <span className="text-2xl" aria-hidden="true">🎤</span>
              <div>
                <p className="text-sm font-semibold">Add Talk</p>
                <p className="text-sm text-[#5b5577]">Notes + ideas from a session</p>
              </div>
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
