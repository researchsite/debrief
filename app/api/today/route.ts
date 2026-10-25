import { NextRequest, NextResponse } from 'next/server';
import { getTodayTimeline, getEventSummary, type TimelineEntry } from '@/lib/graph-writes';

interface ResponseBody {
  timeline: TimelineEntry[];
  event: { eventName: string; primaryIntent: string } | null;
}

const DAY_MS = 24 * 3600 * 1000;

/** Start of the viewer's local day, sent by the client; ignored unless within a day of now. */
function parseTodayStart(request: NextRequest): number | undefined {
  const raw = Number(request.nextUrl.searchParams.get('since'));
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.abs(Date.now() - raw) <= DAY_MS ? raw : undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse<ResponseBody>> {
  const [timeline, event] = await Promise.all([
    getTodayTimeline('debrief', parseTodayStart(request)),
    getEventSummary('debrief'),
  ]);

  return NextResponse.json({ timeline, event });
}
