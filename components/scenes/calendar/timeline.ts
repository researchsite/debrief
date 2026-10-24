import type { TimelineEntry } from '@/lib/graph-writes';

export interface DaySection {
  key: string;
  label: string;
  entries: TimelineEntry[];
}

/** Stable identity for a timeline entry; repeat captures share it. */
export function entryKey(entry: TimelineEntry): string {
  return `${entry.type}|${entry.url ?? ''}|${entry.title}`;
}

/**
 * Drops repeat entries (the graph keeps one MET edge per capture, so the same
 * person can come back several times). Input is newest-first, so the newest wins.
 */
export function dedupeEntries(entries: TimelineEntry[]): TimelineEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = entryKey(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Groups entries into Today, Tomorrow, then any later dates. Today and Tomorrow always appear. */
export function groupByDay(entries: TimelineEntry[], now = Date.now()): DaySection[] {
  const today = dayStart(now);
  const tomorrow = dayStart(today + 36 * 3600 * 1000);
  const later = new Map<number, TimelineEntry[]>();
  const todayEntries: TimelineEntry[] = [];
  const tomorrowEntries: TimelineEntry[] = [];

  for (const entry of entries) {
    const day = dayStart(entry.timestamp);
    if (day <= today) todayEntries.push(entry);
    else if (day === tomorrow) tomorrowEntries.push(entry);
    else later.set(day, [...(later.get(day) ?? []), entry]);
  }

  const fmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return [
    { key: 'today', label: 'Today', entries: todayEntries },
    { key: 'tomorrow', label: 'Tomorrow', entries: tomorrowEntries },
    ...[...later.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, list]) => ({ key: String(day), label: fmt.format(day), entries: list })),
  ];
}

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = now - ts;
  if (diff < 0) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
