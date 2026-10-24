'use client';

import { useCallback, useEffect, useState } from 'react';

// ────────────────────────────────────────────────────────────
// Types (mirrors lib/event-extract.ts and lib/graph-writes.ts)
// ────────────────────────────────────────────────────────────

export interface ExtractedSpeaker {
  name: string;
  title: string;
  company: string;
  linkedin_url: string;
}

export interface ExtractedSession {
  title: string;
  starts: string;
  ends: string;
  room: string;
  abstract: string;
  speakers: ExtractedSpeaker[];
}

export interface ExtractedEvent {
  name: string;
  date: string;
  venue: string;
}

export interface EventExtraction {
  event: ExtractedEvent;
  sessions: ExtractedSession[];
}

export interface MeetPlanEntry {
  name: string;
  headline: string;
  linkedinUrl: string;
  score: number;
  reasons: string[];
  via: string[];
  opener: string;
  sessionTitle?: string;
  company?: string;
}

export type LoadState = 'loading' | 'ready' | 'error';

/** Adds or replaces an event (matched by name) in the dial list. */
function upsertEvent(list: EventExtraction[], next: EventExtraction): EventExtraction[] {
  const idx = list.findIndex((e) => e.event.name === next.event.name);
  if (idx === -1) return [...list, next];
  const copy = list.slice();
  copy[idx] = next;
  return copy;
}

/**
 * All event page state and API calls: stored event load, URL import,
 * schedule refresh, and "met" marking. Shared by the dial scene and the
 * classic list view so both drive the same real endpoints.
 */
export function useEventData() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [extraction, setExtraction] = useState<EventExtraction | null>(null);
  const [events, setEvents] = useState<EventExtraction[]>([]);
  const [meetPlan, setMeetPlan] = useState<MeetPlanEntry[]>([]);
  const [metSet, setMetSet] = useState<Set<string>>(new Set());
  const [storedEventUrl, setStoredEventUrl] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // On mount (and on retry), load stored schedule + meet plan from graph
  useEffect(() => {
    let cancelled = false;
    fetch('/api/event')
      .then((r) => r.json())
      .then((data: {
        ok: boolean;
        error?: string;
        event?: { name: string; date: string; venue: string; url: string } | null;
        sessions?: ExtractedSession[];
        meetPlan?: MeetPlanEntry[];
      }) => {
        if (cancelled) return;
        if (!data.ok) {
          setLoadError(data.error || 'Could not reach the event graph.');
          setLoadState('error');
          return;
        }
        if (data.event?.name) {
          const loaded: EventExtraction = {
            event: { name: data.event.name, date: data.event.date, venue: data.event.venue },
            sessions: (data.sessions ?? []).map((s) => ({
              ...s,
              // Graph returns speakerNames string[]; convert to ExtractedSpeaker[]
              speakers: s.speakers ?? (s as unknown as { speakerNames?: string[] }).speakerNames?.map(
                (name) => ({ name, title: '', company: '', linkedin_url: '' })
              ) ?? [],
            })),
          };
          setExtraction(loaded);
          setEvents((prev) => upsertEvent(prev, loaded));
          setStoredEventUrl(data.event.url ?? '');
        }
        if (data.meetPlan && data.meetPlan.length > 0) setMeetPlan(data.meetPlan);
        setLoadError('');
        setLoadState('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Network error');
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retryLoad = useCallback(() => {
    setLoadState('loading');
    setReloadKey((k) => k + 1);
  }, []);

  async function handleRefresh() {
    setError('');
    setRefreshing(true);
    try {
      const res = await fetch('/api/event/refresh', { method: 'POST' });
      const data = (await res.json()) as {
        ok: boolean;
        extraction?: EventExtraction;
        sessions?: ExtractedSession[];
        meetPlan?: MeetPlanEntry[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Refresh failed');
        return;
      }
      if (data.extraction) {
        const next = data.extraction;
        setExtraction(next);
        setEvents((prev) => upsertEvent(prev, next));
      }
      if (data.meetPlan) setMeetPlan(data.meetPlan);
      setLastRefreshed(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRefreshing(false);
    }
  }

  /** Imports the event at `url`. Resolves to the imported extraction, or null on failure. */
  async function handleImport(): Promise<EventExtraction | null> {
    setError('');
    if (!url.trim()) {
      setError('Please enter an event URL.');
      return null;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        extraction?: EventExtraction;
        meetPlan?: MeetPlanEntry[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Something went wrong');
        return null;
      }
      if (data.meetPlan) setMeetPlan(data.meetPlan);
      if (data.extraction) {
        const next = data.extraction;
        setExtraction(next);
        setEvents((prev) => upsertEvent(prev, next));
        setStoredEventUrl((prev) => prev || url.trim());
        setLoadState('ready');
        return next;
      }
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleMet(personUrl: string) {
    try {
      await fetch('/api/event/met', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personUrl }),
      });
      setMetSet((prev) => new Set(prev).add(personUrl));
    } catch {
      // silently fail
    }
  }

  return {
    url,
    setUrl,
    loading,
    refreshing,
    error,
    setError,
    extraction,
    events,
    meetPlan,
    metSet,
    storedEventUrl,
    lastRefreshed,
    loadState,
    loadError,
    retryLoad,
    handleRefresh,
    handleImport,
    handleMet,
  };
}

export type EventData = ReturnType<typeof useEventData>;
