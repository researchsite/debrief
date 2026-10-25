import { NextRequest, NextResponse } from 'next/server';
import { extractEventFromUrl } from '@/lib/event-extract';

export const maxDuration = 120;
import { getStoredEvents, getSessions, getMeetPlan } from '@/lib/graph-writes';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json().catch(() => ({})) as { eventName?: string };
    const events = await getStoredEvents('debrief');
    const stored = body.eventName
      ? events.find((event) => event.name === body.eventName)
      : events.find((event) => event.url) ?? events[0];
    if (!stored?.url) {
      return NextResponse.json(
        { ok: false, error: 'No event URL stored. Import an event first.' },
        { status: 400 },
      );
    }
    const extraction = await extractEventFromUrl(stored.url, 'debrief');
    const sessions = await getSessions('debrief', stored.name);
    const meetPlan = await getMeetPlan('debrief');

    // Keep local cache in sync with latest schedule
    try {
      const eventsDir = path.join(process.cwd(), '_private', 'events');
      fs.mkdirSync(eventsDir, { recursive: true });
      const slug = extraction.event.name
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
        || new URL(stored.url).hostname.replace(/\./g, '-');
      fs.writeFileSync(
        path.join(eventsDir, `${slug}.json`),
        JSON.stringify({ url: stored.url, savedAt: new Date().toISOString(), extraction }, null, 2),
      );
    } catch {
      // Non-fatal
    }

    return NextResponse.json({ ok: true, extraction, sessions, meetPlan });
  } catch (err) {
    console.error('[POST /api/event/refresh]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 },
    );
  }
}
