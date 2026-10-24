import { NextResponse } from 'next/server';
import { getTodayTimeline, getEventSummary, type TimelineEntry } from '@/lib/graph-writes';

interface ResponseBody {
  timeline: TimelineEntry[];
  event: { eventName: string; primaryIntent: string } | null;
}

export async function GET(): Promise<NextResponse<ResponseBody>> {
  const [timeline, event] = await Promise.all([
    getTodayTimeline('debrief'),
    getEventSummary('debrief'),
  ]);

  return NextResponse.json({ timeline, event });
}
