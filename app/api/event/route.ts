import { NextRequest, NextResponse } from 'next/server';
import { extractEventFromUrl, type EventExtraction } from '@/lib/event-extract';
import { getMeetPlan, type MeetPlanEntry } from '@/lib/graph-writes';

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
    return NextResponse.json({ ok: true, extraction, meetPlan });
  } catch (err) {
    console.error('[POST /api/event]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
