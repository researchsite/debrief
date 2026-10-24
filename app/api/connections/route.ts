import { NextRequest, NextResponse } from 'next/server';
import { query } from '../../../lib/graph';

interface ConnectionRow {
  'First Name': string;
  'Last Name': string;
  URL: string;
  'Email Address': string;
  Company: string;
  Position: string;
  'Connected On': string;
}

interface RequestBody {
  rows: ConnectionRow[];
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { rows } = body;
  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: 'rows must be an array' }, { status: 400 });
  }

  // Skip rows where URL is empty
  const validRows = rows.filter((r) => r.URL && r.URL.trim() !== '');
  const skipped = rows.length - validRows.length;

  if (validRows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, skipped });
  }

  const params = {
    rows: validRows.map((r) => ({
      url: r.URL.trim(),
      firstName: r['First Name'] ?? '',
      lastName: r['Last Name'] ?? '',
      position: r['Position'] ?? '',
      connectedOn: r['Connected On'] ?? '',
    })),
  };

  // Query 1: Create/merge Person nodes and CONNECTED edges (all valid rows)
  await query(
    `UNWIND $rows AS r
MERGE (p:Person {linkedin_url: r.url})
SET p.name = r.firstName + ' ' + r.lastName, p.headline = r.position
WITH p, r
MATCH (me:Me)
MERGE (me)-[:CONNECTED {since: r.connectedOn}]->(p)`,
    params,
  );

  // Query 2: Create/merge Company nodes and WORKS_AT edges (only rows with non-empty company)
  const companyRows = validRows.filter((r) => r.Company && r.Company.trim() !== '');
  if (companyRows.length > 0) {
    await query(
      `UNWIND $companyRows AS r
MERGE (c:Company {name: r.company})
WITH c, r
MATCH (p:Person {linkedin_url: r.url})
MERGE (p)-[:WORKS_AT]->(c)`,
      {
        companyRows: companyRows.map((r) => ({
          url: r.URL.trim(),
          company: r.Company.trim(),
        })),
      },
    );
  }

  return NextResponse.json({ ok: true, imported: validRows.length, skipped });
}
