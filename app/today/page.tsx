'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import type { TimelineEntry } from '@/lib/graph-writes';

interface TodayApiResponse {
  timeline: TimelineEntry[];
  event: { eventName: string; primaryIntent: string } | null;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export default function TodayPage() {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [event, setEvent] = useState<{ eventName: string; primaryIntent: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/today');
        if (res.ok) {
          const data = (await res.json()) as TodayApiResponse;
          setTimeline(data.timeline ?? []);
          setEvent(data.event ?? null);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <div className="flex flex-col min-h-[80vh] px-4 py-6 space-y-4 max-w-[420px] mx-auto">
      {/* Event status bar */}
      {event && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{event.eventName}</p>
          </div>
          <span className="shrink-0 inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium capitalize">
            {event.primaryIntent}
          </span>
        </div>
      )}

      {/* Timeline header */}
      <h1 className="text-xl font-bold tracking-tight">Today</h1>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!loading && timeline.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground text-sm">
            Nothing captured yet today. Tap + to add your first person or talk.
          </p>
        </div>
      )}

      {/* Timeline entries */}
      {!loading && timeline.length > 0 && (
        <div className="space-y-3">
          {timeline.map((entry, i) => (
            <TimelineCard key={i} entry={entry} />
          ))}
        </div>
      )}

      {/* Floating "+" button with Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger
          aria-label="Add capture"
          className="fixed bottom-20 right-4 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-primary text-primary-foreground text-2xl shadow-lg hover:bg-primary/80 transition-colors"
        >
          +
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-6">
            <SheetTitle>Add capture</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3">
            <Link
              href="/add-person"
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 text-left hover:bg-muted transition-colors"
            >
              <span className="text-2xl" aria-hidden="true">👤</span>
              <div>
                <p className="font-semibold text-sm">Add Person</p>
                <p className="text-xs text-muted-foreground">Scan QR or enter LinkedIn URL</p>
              </div>
            </Link>
            <Link
              href="/add-talk"
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-4 text-left hover:bg-muted transition-colors"
            >
              <span className="text-2xl" aria-hidden="true">🎤</span>
              <div>
                <p className="font-semibold text-sm">Add Talk</p>
                <p className="text-xs text-muted-foreground">Notes + ideas from a session</p>
              </div>
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TimelineCard({ entry }: { entry: TimelineEntry }) {
  const timeLabel = relativeTime(entry.timestamp);

  const cardContent = (
    <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors">
      {/* Icon */}
      <span className="text-lg shrink-0" aria-hidden="true">
        {entry.type === 'person' ? '👤' : entry.type === 'talk' ? '🎤' : '🎟️'}
      </span>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{entry.title}</p>
        {entry.subtitle && (
          <p className="text-xs text-muted-foreground truncate">{entry.subtitle}</p>
        )}
      </div>

      {/* Timestamp */}
      <span className="shrink-0 text-xs text-muted-foreground">{timeLabel}</span>
    </div>
  );

  if (entry.url) {
    return <Link href={entry.url}>{cardContent}</Link>;
  }

  return cardContent;
}
