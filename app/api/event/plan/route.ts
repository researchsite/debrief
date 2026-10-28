import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getMeetPlan, type MeetPlanEntry } from '@/lib/graph-writes';

interface ResponseBody {
  plan: MeetPlanEntry[];
}

export async function GET(): Promise<NextResponse<ResponseBody>> {
  if (process.env.USE_MOCK_DATA === 'true') {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'fixtures/mock/meetplan.json'), 'utf8'),
    ) as ResponseBody;
    return NextResponse.json(fixture);
  }

  try {
    const plan = await getMeetPlan('debrief');
    return NextResponse.json({ plan });
  } catch (err) {
    console.error('[GET /api/event/plan]', err);
    return NextResponse.json({ plan: [] });
  }
}
