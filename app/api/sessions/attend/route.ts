import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/graph';

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { title?: string };
  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  await query(
    `MATCH (me:Me) MATCH (s:Session {title: $title}) MERGE (me)-[:SAW]->(s)`,
    { title },
  );

  return NextResponse.json({ ok: true });
}
