import { NextResponse } from 'next/server';
import { extractEventFromUrl } from '@/lib/event-extract';
import { getStoredEvent, getSessions, getMeetPlan } from '@/lib/graph-writes';

export async function POST(): Promise<NextResponse> {
  try {
    const stored = await getStoredEvent('debrief');
    if (!stored?.url) {
      return NextResponse.json(
        { ok: false, error: 'No event URL stored. Import an event first.' },
        { status: 400 },
      );
    }
    const extraction = await extractEventFromUrl(stored.url, 'debrief');
    const sessions = await getSessions('debrief');
    const meetPlan = await getMeetPlan('debrief');
    return NextResponse.json({ ok: true, extraction, sessions, meetPlan });
  } catch (err) {
    console.error('[POST /api/event/refresh]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 },
    );
  }
}
