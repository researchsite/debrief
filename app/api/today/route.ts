import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getTodayTimeline, getEventSummary, type TimelineEntry } from '@/lib/graph-writes';

interface ResponseBody {
  timeline: TimelineEntry[];
  event: { eventName: string; primaryIntent: string } | null;
}

export async function GET(): Promise<NextResponse<ResponseBody>> {
  if (process.env.USE_MOCK_DATA === 'true') {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'fixtures/mock/today.json'), 'utf8'),
    ) as ResponseBody;
    return NextResponse.json(fixture);
  }

  const [timeline, event] = await Promise.all([
    getTodayTimeline('debrief'),
    getEventSummary('debrief'),
  ]);

  return NextResponse.json({ timeline, event });
}
