import { NextRequest, NextResponse } from 'next/server';
import { extractEventFromUrl, type EventExtraction } from '@/lib/event-extract';

export const maxDuration = 120;
import { getMeetPlan, getStoredEvents, getSessions, type MeetPlanEntry } from '@/lib/graph-writes';
import fs from 'fs';
import path from 'path';

export async function GET(): Promise<NextResponse> {
  try {
    const storedEvents = await getStoredEvents('debrief');
    const events = await Promise.all(storedEvents.map(async (event) => ({
      ...event,
      sessions: await getSessions('debrief', event.name),
    })));
    const meetPlan = await getMeetPlan('debrief');
    return NextResponse.json({ ok: true, events, meetPlan });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

interface RequestBody {
  url: string;
}

interface ResponseBody {
  ok: boolean;
  extraction?: EventExtraction;
  meetPlan?: MeetPlanEntry[];
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<ResponseBody>> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.url) {
    return NextResponse.json({ ok: false, error: 'url is required' }, { status: 400 });
  }

  try {
    const extraction = await extractEventFromUrl(body.url, 'debrief');
    const meetPlan = await getMeetPlan('debrief');

    // Save extraction locally so it can be re-seeded without re-entering the URL
    try {
      const eventsDir = path.join(process.cwd(), '_private', 'events');
      fs.mkdirSync(eventsDir, { recursive: true });
      const slug = extraction.event.name
        .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
        || new URL(body.url).hostname.replace(/\./g, '-');
      const filePath = path.join(eventsDir, `${slug}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ url: body.url, savedAt: new Date().toISOString(), extraction }, null, 2));
    } catch {
      // Non-fatal — graph was already written successfully
    }

    return NextResponse.json({ ok: true, extraction, meetPlan });
  } catch (err) {
    console.error('[POST /api/event]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
