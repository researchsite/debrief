/**
 * Repair script: revert all bad note links, reimport from conversation_event.csv
 * Authoritative source: _private/conversation_event.csv (14 rows)
 */
import { FalkorDB } from 'falkordb';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

const client = await FalkorDB.connect({
  socket: { host: process.env.FALKORDB_HOST, port: parseInt(process.env.FALKORDB_PORT), tls: process.env.FALKORDB_SSL === 'true' },
  ...(process.env.FALKORDB_USERNAME && { username: process.env.FALKORDB_USERNAME }),
  ...(process.env.FALKORDB_PASSWORD && { password: process.env.FALKORDB_PASSWORD }),
});
const graph = client.selectGraph('debrief');

async function q(cypher, params = {}) {
  const r = await graph.query(cypher, { params });
  return r.data ?? [];
}

// ── Step 1: Wipe ALL Note nodes and related edges ───────────────────────────
console.log('\n[1] Deleting all HAS_NOTE relationships...');
const hn = await q('MATCH ()-[r:HAS_NOTE]->() DELETE r RETURN count(r) AS c');
console.log('    deleted HAS_NOTE:', hn[0]?.c ?? 0);

console.log('[1] Deleting all PRODUCED relationships...');
const prod = await q('MATCH ()-[r:PRODUCED]->() DELETE r RETURN count(r) AS c');
console.log('    deleted PRODUCED:', prod[0]?.c ?? 0);

console.log('[1] Deleting all Note nodes...');
const notes = await q('MATCH (n:Note) DETACH DELETE n RETURN count(n) AS c');
console.log('    deleted Notes:', notes[0]?.c ?? 0);

// ── Step 2: Delete bad WITH relationships from Conversations ─────────────────
console.log('\n[2] Deleting all Conversation WITH relationships...');
const withRel = await q('MATCH ()-[r:WITH]->() DELETE r RETURN count(r) AS c');
console.log('    deleted WITH:', withRel[0]?.c ?? 0);

// ── Step 3: Fix isHiring — only Kasey Johnson ─────────────────────────────
console.log('\n[3] Clearing isHiring from ALL persons...');
const clearHiring = await q('MATCH (p:Person) WHERE p.isHiring = true REMOVE p.isHiring RETURN count(p) AS c');
console.log('    cleared isHiring from:', clearHiring[0]?.c ?? 0, 'persons');

console.log('[3] Setting isHiring=true for Kasey Johnson...');
const kaseySet = await q(
  `MATCH (p:Person {linkedin_url: 'https://www.linkedin.com/in/kasey-johnson-08655b39/'})
   SET p.isHiring = true
   RETURN p.name AS name`
);
console.log('    set isHiring on:', kaseySet.map(r => r.name).join(', ') || 'NOT FOUND');

// ── Step 4: Load CSV and map to Person URLs ──────────────────────────────────
const csvRows = [
  { name: 'Kasey Johnson',                  url: 'https://www.linkedin.com/in/kasey-johnson-08655b39/', note: 'Marketing and events. Discussed marketing events and job opportunities. Kasey is a marketing professional at Bright Data with experience in marketing and community events. A useful contact for future AI events and professional networking.' },
  { name: 'Liz (Lizz) Zhang',               url: 'https://www.linkedin.com/in/lizz-zhang/',            note: 'FalkorDB and deployment. Discussed moving a project from a local environment to the cloud and the differences involved. Also exchanged feedback about SDK scripts versus API usage. Follow up on FalkorDB integration, deployment options, and developer experience.' },
  { name: 'Nancy Li',                        url: 'https://www.linkedin.com/in/nancyli1/',               note: 'Community and event organizing. Energetic and helpful, with a strong interest in organizing community events around causes such as water and food. A good connection for future community initiatives and tech events.' },
  { name: 'Neil Ricci',                      url: 'https://www.linkedin.com/in/neil-ricci/',             note: 'Bright Data and web scraping. Helped us understand Bright Data usage for web scraping, including LinkedIn limitations and UI bugs we encountered. A valuable technical contact for troubleshooting scraping workflows and web data access.' },
  { name: 'Kunal Kushwaha',                  url: 'https://www.linkedin.com/in/kunal-kushwaha/',         note: 'Event hosting and Qodo sponsorship. Came from Amsterdam and brought great energy despite the travel and potential jet lag. Helped welcome participants, distribute codes, and support the Qodo sponsor activities. A memorable and energetic presence at the event.' },
  { name: 'Shesha Sai Kumar Reddy Sadu',     url: 'https://www.linkedin.com/in/ssskr',                   note: 'Geospatial and data expertise. Introduced as a geospatial specialist. Worth reconnecting to learn more about his work in geospatial technologies and explore potential overlap with AI and data-driven applications. The profile also references data engineering experience.' },
  { name: 'Madhu Koseke',                    url: 'https://www.linkedin.com/in/madhukoseke/',            note: 'Teammate and senior data engineer. A teammate and senior data engineer; you noted a connection to "Montica" (company name to verify). Useful professional connection for exchanging ideas on data engineering, platforms, and AI projects. The profile describes a focus on data platforms.' },
  { name: 'Claudio Olmedo',                  url: 'https://www.linkedin.com/in/claudioolmedo-com',       note: 'One Dollar Computer and robotics. Discussed One Dollar Computer and robotics. His work focuses on making computing and STEM education more accessible. Follow up on low-cost computing, robotics, and hands-on technology education.' },
  { name: 'Mannan Shukla',                   url: 'https://www.linkedin.com/in/mannanshukla',            note: 'Developer tools and deployment. Discussed the idea of bringing the tools a team builds together in one place. His profile highlights cloud-native engineering and Spawnpoint, a tool designed to help developers deploy software to the cloud through coding agents and MCP. Follow up on developer tooling and agent-driven deployment.' },
  { name: 'Sidra Miconi',                    url: 'https://www.linkedin.com/in/sidramiconi',             note: 'AgentGlass founder. Founder of AgentGlass, focused on AI agent reliability and evaluation. A relevant connection for discussions about agent quality, testing, evaluation, and production readiness.' },
  { name: 'Aarsh Sheth',                     url: 'https://www.linkedin.com/in/aarsheth/',               note: 'Backend and distributed systems. Discussed backend engineering and distributed systems. A potential contact for exchanging ideas on scalable architectures, backend services, and infrastructure for AI applications.' },
  { name: 'Joshua Levy',                     url: 'https://www.linkedin.com/in/jlevy',                   note: 'Agent-to-agent communication. Discussed the idea of agents communicating and collaborating directly with other agents. Follow up on multi-agent architecture, agent handoffs, shared context, and practical agent-to-agent workflows.' },
  { name: 'Madhughnea Adabala',              url: 'https://www.linkedin.com/in/madhughnea/',             note: 'Teammate and UX. A teammate with a UX connection. A useful person to collaborate with on improving user experience, product workflows, and the interface for AI-powered applications. His profile also highlights backend systems work.' },
  { name: 'Abhinav R Bharadwaj',             url: 'https://www.linkedin.com/in/abhinavrbharadwaj',       note: 'Full-stack and AI application development. Software engineer at Regilient, with experience in Python, the MERN stack, full-stack development, and AI applications. A potential connection for exchanging ideas on building scalable web applications and AI-powered products.' },
];

// ── Step 5: Create a Note per person and link it ─────────────────────────────
console.log('\n[5] Creating notes from CSV...');
const now = Date.now();
let created = 0;
let notFound = 0;

for (const row of csvRows) {
  const ts = now + created; // unique timestamp per note
  const result = await q(
    `MATCH (p:Person {linkedin_url: $url})
     CREATE (n:Note {text: $text, created_at: $ts, source: 'csv_import'})
     CREATE (p)-[:HAS_NOTE]->(n)
     RETURN p.name AS name`,
    { url: row.url, text: row.note, ts }
  );
  if (result.length > 0) {
    console.log(`    ✓ ${result[0].name} (${row.name})`);
    created++;
  } else {
    // Try without trailing slash
    const url2 = row.url.replace(/\/$/, '');
    const r2 = await q(
      `MATCH (p:Person) WHERE p.linkedin_url = $url OR p.linkedin_url = $url2
       CREATE (n:Note {text: $text, created_at: $ts, source: 'csv_import'})
       CREATE (p)-[:HAS_NOTE]->(n)
       RETURN p.name AS name`,
      { url: row.url, url2, text: row.note, ts }
    );
    if (r2.length > 0) {
      console.log(`    ✓ ${r2[0].name} (${row.name}) [matched via url2]`);
      created++;
    } else {
      console.log(`    ✗ NOT FOUND: ${row.name} @ ${row.url}`);
      notFound++;
    }
  }
}

console.log(`\n    Created: ${created}, Not found: ${notFound}`);

// ── Step 6: Verify ───────────────────────────────────────────────────────────
console.log('\n[6] Verification...');
const verify = await q(`
  MATCH (p:Person)-[:HAS_NOTE]->(n:Note)
  RETURN p.name AS name, left(n.text, 60) AS snippet
  ORDER BY p.name
`);
verify.forEach(r => console.log(`  ${r.name}: ${r.snippet}`));

const totalNotes = await q('MATCH (n:Note) RETURN count(n) AS c');
const totalHN = await q('MATCH ()-[r:HAS_NOTE]->() RETURN count(r) AS c');
console.log(`\n  Total Notes: ${totalNotes[0]?.c}, Total HAS_NOTE: ${totalHN[0]?.c}`);

const kaseyCheck = await q(`MATCH (p:Person {linkedin_url: 'https://www.linkedin.com/in/kasey-johnson-08655b39/'}) RETURN p.name AS name, p.isHiring AS hiring`);
console.log(`  Kasey isHiring: ${kaseyCheck[0]?.hiring}`);

await client.close();
console.log('\nDone.');
