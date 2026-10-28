import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/graph';

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { sessionTitle?: string; speakerName?: string };
  const title = body.sessionTitle?.trim();
  const name = body.speakerName?.trim();
  if (!title || !name) return NextResponse.json({ error: 'sessionTitle and speakerName required' }, { status: 400 });

  // Upsert Person, link to session, and mark as MET
  await query('MERGE (p:Person {name: $name})', { name });
  await query(
    'MATCH (p:Person {name: $name}) MATCH (s:Session {title: $title}) MERGE (p)-[:SPEAKS_AT]->(s)',
    { name, title },
  );
  await query(
    'MATCH (me:Me) MATCH (p:Person {name: $name}) MERGE (me)-[:MET {at: $at}]->(p)',
    { name, at: Date.now() },
  );

  return NextResponse.json({ ok: true });
}
