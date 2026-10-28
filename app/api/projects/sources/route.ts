import { NextResponse } from 'next/server';
import { getHackProjectSources } from '@/lib/graph-writes';

export async function GET(): Promise<NextResponse> {
  const sources = await getHackProjectSources('debrief');
  return NextResponse.json({ ok: true, sources });
}
