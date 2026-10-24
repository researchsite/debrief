import { NextRequest, NextResponse } from 'next/server';
import { roQuery } from '@/lib/graph';
import { researchPerson, researchPersonForce } from '@/lib/research';

interface RequestBody {
  personUrl: string;
  force?: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.personUrl) {
    return NextResponse.json({ ok: false, error: 'personUrl is required' }, { status: 400 });
  }

  const { personUrl, force = false } = body;

  // Look up person + company from graph
  const result = await roQuery(
    `MATCH (p:Person {linkedin_url: $url})-[:WORKS_AT]->(c:Company)
     RETURN p.name AS name, c.name AS company LIMIT 1`,
    { url: personUrl },
    'debrief',
  );

  const row = result.data?.[0];
  if (!row) {
    return NextResponse.json({ ok: false, error: 'Person not found' }, { status: 404 });
  }

  const name = String(row.name ?? '');
  const company = String(row.company ?? '');

  if (force) {
    await researchPersonForce(personUrl, name, company, 'debrief');
  } else {
    await researchPerson(personUrl, name, company, 'debrief');
  }

  return NextResponse.json({ ok: true });
}
