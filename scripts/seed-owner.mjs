/**
 * One-time seed script: writes owner data from LinkedIn CSVs into the debrief graph.
 * Run: node scripts/seed-owner.mjs
 * Never commit or log personal data.
 */
import { createRequire } from 'module';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const Papa = require('papaparse');
const { FalkorDB } = require('falkordb');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LINKEDIN_DIR = join(ROOT, '_private', 'linkedin');
const EVENTS_DIR = join(ROOT, '_private', 'events');
const GRAPH_NAME = 'debrief';

// Load .env.local so we connect to the same FalkorDB instance as the app
function loadEnv() {
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
  }
}
loadEnv();

function getConnectOptions() {
  const url = process.env.FALKORDB_URL;
  if (url) return { url };
  const host = process.env.FALKORDB_HOST ?? 'localhost';
  const port = parseInt(process.env.FALKORDB_PORT ?? '6379', 10);
  const username = process.env.FALKORDB_USERNAME;
  const password = process.env.FALKORDB_PASSWORD;
  const ssl = process.env.FALKORDB_SSL === 'true';
  return {
    socket: { host, port, tls: ssl },
    ...(username && { username }),
    ...(password && { password }),
  };
}

// Owner's LinkedIn URL — update if known; used as the Me node key.
const OWNER_LINKEDIN_URL = 'https://www.linkedin.com/in/shassanchi';

// Derive event name from saved event JSON files so the ATTENDED edge points to the right node
function getEventNames() {
  if (!existsSync(EVENTS_DIR)) return [];
  return readdirSync(EVENTS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const { extraction } = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf-8'));
        return extraction?.event ?? null;
      } catch { return null; }
    })
    .filter(Boolean);
}

function parseCsv(filename, expectedFirstCol) {
  const text = readFileSync(join(LINKEDIN_DIR, filename), 'utf-8');
  const lines = text.split('\n');
  const headerIdx = lines.findIndex(l => l.startsWith(expectedFirstCol));
  if (headerIdx === -1) throw new Error(`Header "${expectedFirstCol}" not found in ${filename}`);
  const slice = lines.slice(headerIdx).join('\n');
  const result = Papa.parse(slice, { header: true, skipEmptyLines: true });
  return result.data;
}

async function run() {
  const db = await FalkorDB.connect(getConnectOptions());
  const graph = db.selectGraph(GRAPH_NAME);

  const q = async (cypher, params = {}) => graph.query(cypher, { params });

  // 1. Parse Profile.csv
  const profiles = parseCsv('Profile.csv', 'First Name');
  const profile = profiles[0];
  const ownerName = `${profile['First Name']} ${profile['Last Name']}`.trim();
  const headline = profile['Headline'] ?? '';

  console.log(`Seeding owner: ${ownerName}`);

  // 2. Create/update Me node
  await q('MERGE (me:Me {linkedin_url: $url}) SET me.name = $name, me.headline = $headline',
    { url: OWNER_LINKEDIN_URL, name: ownerName, headline });

  // 3. Create Event nodes from saved JSON files and link Me-[:ATTENDED]->Event
  const events = getEventNames();
  for (const ev of events) {
    await q('MERGE (e:Event {name: $name}) SET e.date = $date, e.venue = $venue',
      { name: ev.name, date: ev.date ?? '', venue: ev.venue ?? '' });
    await q('MATCH (me:Me {linkedin_url: $url}) MATCH (e:Event {name: $name}) MERGE (me)-[:ATTENDED]->(e)',
      { url: OWNER_LINKEDIN_URL, name: ev.name });
    console.log(`  Linked Me-[:ATTENDED]->(${ev.name})`);
  }

  // 4. Parse Positions.csv
  const positions = parseCsv('Positions.csv', 'Company Name');
  let currentCompany = null;
  for (const pos of positions) {
    const company = pos['Company Name']?.trim();
    if (!company) continue;
    const isCurrentPosition = !pos['Finished On'] || pos['Finished On'].trim() === '';
    await q('MERGE (c:Company {name: $name})', { name: company });
    if (isCurrentPosition) {
      currentCompany = company;
      await q('MATCH (me:Me {linkedin_url: $url}) MATCH (c:Company {name: $name}) MERGE (me)-[:WORKS_AT]->(c)',
        { url: OWNER_LINKEDIN_URL, name: company });
    } else {
      await q('MATCH (me:Me {linkedin_url: $url}) MATCH (c:Company {name: $name}) MERGE (me)-[:WORKED_AT]->(c)',
        { url: OWNER_LINKEDIN_URL, name: company });
    }
  }
  console.log(`  Positions: ${positions.length} (current: ${currentCompany})`);

  // 5. Parse Education.csv
  const education = parseCsv('Education.csv', 'School Name');
  for (const edu of education) {
    const school = edu['School Name']?.trim();
    if (!school) continue;
    await q('MERGE (s:School {name: $name})', { name: school });
    await q('MATCH (me:Me {linkedin_url: $url}) MATCH (s:School {name: $name}) MERGE (me)-[:STUDIED_AT]->(s)',
      { url: OWNER_LINKEDIN_URL, name: school });
  }
  console.log(`  Education: ${education.length}`);

  // 6. Parse Skills.csv
  const skills = parseCsv('Skills.csv', 'Name');
  for (const sk of skills) {
    const skillName = sk['Name']?.trim().toLowerCase();
    if (!skillName) continue;
    await q('MERGE (sk:Skill {name: $name})', { name: skillName });
    await q('MATCH (me:Me {linkedin_url: $url}) MATCH (sk:Skill {name: $name}) MERGE (me)-[:HAS_SKILL]->(sk)',
      { url: OWNER_LINKEDIN_URL, name: skillName });
  }
  console.log(`  Skills: ${skills.length}`);

  // 7. Check for Connections.csv (may not exist yet)
  try {
    const connections = parseCsv('Connections.csv', 'First Name');
    const validConns = connections.filter(r => r['URL']?.trim());
    console.log(`  Connections.csv found: ${validConns.length} valid rows`);

    // Import in batches of 500
    for (let i = 0; i < validConns.length; i += 500) {
      const batch = validConns.slice(i, i + 500).map(r => ({
        url: r['URL'].trim(),
        firstName: r['First Name']?.trim() ?? '',
        lastName: r['Last Name']?.trim() ?? '',
        position: r['Position']?.trim() ?? '',
        connectedOn: r['Connected On']?.trim() ?? '',
        company: r['Company']?.trim() ?? '',
      }));

      await q(
        'UNWIND $rows AS r MERGE (p:Person {linkedin_url: r.url}) SET p.name = r.firstName + \' \' + r.lastName, p.headline = r.position WITH p, r MATCH (me:Me) MERGE (me)-[:CONNECTED {since: r.connectedOn}]->(p)',
        { rows: batch }
      );

      const companyBatch = batch.filter(r => r.company);
      if (companyBatch.length > 0) {
        await q(
          'UNWIND $companyRows AS r MERGE (c:Company {name: r.company}) WITH c, r MATCH (p:Person {linkedin_url: r.url}) MERGE (p)-[:WORKS_AT]->(c)',
          { companyRows: companyBatch.map(r => ({ url: r.url, company: r.company })) }
        );
      }
    }
    console.log(`  Imported ${validConns.length} connections`);
  } catch (e) {
    if (e.message?.includes('not found') || e.code === 'ENOENT') {
      console.log('  Connections.csv not found — skipping (owner can import via /setup)');
    } else {
      throw e;
    }
  }

  await db.close();
  console.log('\nDone. Graph "debrief" seeded with real owner data.');
  console.log('LinkedIn URL used for Me node:', OWNER_LINKEDIN_URL);
  console.log('If this URL is wrong, update it via /setup after the hackathon starts.');
}

run().catch(err => { console.error(err); process.exit(1); });
