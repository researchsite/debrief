import { describe, it, expect, afterAll } from 'vitest';
import { query, roQuery } from '../lib/graph';
import { writeSetup } from '../lib/graph-writes';
import { parseLinkedInCsv } from '../lib/linkedin-csv';
import fs from 'fs';
import path from 'path';

const G = 'debrief_test';
const ME_URL = 'https://www.linkedin.com/in/test-connections-me';

afterAll(async () => {
  await query('MATCH (me:Me {linkedin_url: $url}) DETACH DELETE me', { url: ME_URL }, G);
  await query(
    'MATCH (p:Person) WHERE p.linkedin_url STARTS WITH "https://www.linkedin.com/in/test-conn-" DETACH DELETE p',
    {},
    G,
  );
  await query(
    'MATCH (p:Person) WHERE p.linkedin_url STARTS WITH "https://www.linkedin.com/in/jordan-smith-fake" OR p.linkedin_url STARTS WITH "https://www.linkedin.com/in/priya-kumar-fake" OR p.linkedin_url STARTS WITH "https://www.linkedin.com/in/carlos-vega-fake" OR p.linkedin_url STARTS WITH "https://www.linkedin.com/in/sam-lee-fake" OR p.linkedin_url STARTS WITH "https://www.linkedin.com/in/nina-okonkwo-fake" DETACH DELETE p',
    {},
    G,
  );
  await query('MATCH (c:Company {name: "TestConn Corp"}) DETACH DELETE c', {}, G);
});

async function importRows(rows: Record<string, string>[], graphName: string) {
  // Simulate what the API route does
  const validRows = rows.filter((r) => r.URL);
  const params = {
    rows: validRows.map((r) => ({
      url: r.URL,
      firstName: r['First Name'],
      lastName: r['Last Name'],
      position: r['Position'] ?? '',
      connectedOn: r['Connected On'] ?? '',
    })),
  };
  await query(
    "UNWIND $rows AS r MERGE (p:Person {linkedin_url: r.url}) SET p.name = r.firstName + ' ' + r.lastName, p.headline = r.position WITH p, r MATCH (me:Me) MERGE (me)-[:CONNECTED {since: r.connectedOn}]->(p)",
    params,
    graphName,
  );
  const companyRows = validRows.filter((r) => r.Company);
  if (companyRows.length > 0) {
    await query(
      'UNWIND $companyRows AS r MERGE (c:Company {name: r.company}) WITH c, r MATCH (p:Person {linkedin_url: r.url}) MERGE (p)-[:WORKS_AT]->(c)',
      { companyRows: companyRows.map((r) => ({ url: r.URL, company: r.Company })) },
      graphName,
    );
  }
}

describe('connections import', () => {
  it('imports fixture CSV rows and creates CONNECTED edges', async () => {
    await writeSetup(
      {
        name: 'Test Me',
        linkedinUrl: ME_URL,
        eventName: 'Test',
        eventDate: '2026-10-24',
        targetRole: 'Eng',
        intents: ['networking'],
        primaryIntent: 'networking',
      },
      G,
    );

    const csv = fs.readFileSync(
      path.join(process.cwd(), 'fixtures/brightdata/connections.csv'),
      'utf-8',
    );
    const rows = parseLinkedInCsv<Record<string, string>>(csv, 'First Name');
    // Filter out rows with empty URL
    const validRows = rows.filter((r) => r.URL);

    await importRows(rows, G);

    const result = await roQuery(
      'MATCH (me:Me {linkedin_url: $url})-[:CONNECTED]->(p:Person) RETURN count(p) AS cnt',
      { url: ME_URL },
      G,
    );
    expect(Number(result.data![0].cnt)).toBe(validRows.length);
  });

  it('does not duplicate on second import', async () => {
    const csv = fs.readFileSync(
      path.join(process.cwd(), 'fixtures/brightdata/connections.csv'),
      'utf-8',
    );
    const rows = parseLinkedInCsv<Record<string, string>>(csv, 'First Name');

    await importRows(rows, G);
    await importRows(rows, G); // second run

    const result = await roQuery(
      'MATCH (me:Me {linkedin_url: $url})-[:CONNECTED]->(p:Person) RETURN count(p) AS cnt',
      { url: ME_URL },
      G,
    );
    const validRows = rows.filter((r) => r.URL);
    expect(Number(result.data![0].cnt)).toBe(validRows.length); // same count, no duplicates
  });

  it('skips rows with empty company', async () => {
    const rows = [
      {
        'First Name': 'Test',
        'Last Name': 'NoCompany',
        URL: 'https://www.linkedin.com/in/test-conn-nocompany',
        'Email Address': '',
        Company: '',
        Position: '',
        'Connected On': '2024-01-01',
      },
    ];
    await importRows(rows, G);
    const r = await roQuery(
      'MATCH (p:Person {linkedin_url: "https://www.linkedin.com/in/test-conn-nocompany"})-[:WORKS_AT]->(c:Company) RETURN count(c) AS cnt',
      {},
      G,
    );
    expect(Number(r.data![0].cnt)).toBe(0);
  });
});
