import { NextResponse } from 'next/server';
import { getMeetPlan, type MeetPlanEntry } from '@/lib/graph-writes';

interface ResponseBody {
  plan: MeetPlanEntry[];
}

export async function GET(): Promise<NextResponse<ResponseBody>> {
  try {
    const plan = await getMeetPlan('debrief');
    return NextResponse.json({ plan });
  } catch (err) {
    console.error('[GET /api/event/plan]', err);
    return NextResponse.json({ plan: [] });
  }
}
