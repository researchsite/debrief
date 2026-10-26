/**
 * Import one note per person from conversation_event.csv
 * Run AFTER repair-notes-from-csv.mjs cleaned up the bad data.
 */
import { FalkorDB } from 'falkordb';
import dotenv from 'dotenv';
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

// Sanitize: remove double-quotes (FalkorDB param serialization issue)
function clean(s) {
  return s.replace(/"/g, "'");
}

const csvRows = [
  { name: 'Kasey Johnson',              url: 'https://www.linkedin.com/in/kasey-johnson-08655b39/', note: 'Marketing and events. Discussed marketing events and job opportunities. Kasey is a marketing professional at Bright Data with experience in marketing and community events. A useful contact for future AI events and professional networking.' },
  { name: 'Liz (Lizz) Zhang',           url: 'https://www.linkedin.com/in/lizz-zhang/',            note: 'FalkorDB and deployment. Discussed moving a project from a local environment to the cloud and the differences involved. Also exchanged feedback about SDK scripts versus API usage. Follow up on FalkorDB integration, deployment options, and developer experience.' },
  { name: 'Nancy Li',                    url: 'https://www.linkedin.com/in/nancyli1/',               note: 'Community and event organizing. Energetic and helpful, with a strong interest in organizing community events around causes such as water and food. A good connection for future community initiatives and tech events.' },
  { name: 'Neil Ricci',                  url: 'https://www.linkedin.com/in/neil-ricci/',             note: 'Bright Data and web scraping. Helped us understand Bright Data usage for web scraping, including LinkedIn limitations and UI bugs we encountered. A valuable technical contact for troubleshooting scraping workflows and web data access.' },
  { name: 'Kunal Kushwaha',              url: 'https://www.linkedin.com/in/kunal-kushwaha/',         note: 'Event hosting and Qodo sponsorship. Came from Amsterdam and brought great energy despite the travel and potential jet lag. Helped welcome participants, distribute codes, and support the Qodo sponsor activities. A memorable and energetic presence at the event.' },
  { name: 'Shesha Sai Kumar Reddy Sadu', url: 'https://www.linkedin.com/in/ssskr',                   note: 'Geospatial and data expertise. Introduced as a geospatial specialist. Worth reconnecting to learn more about his work in geospatial technologies and explore potential overlap with AI and data-driven applications. His profile also references data engineering experience.' },
  { name: 'Madhu Koseke',                url: 'https://www.linkedin.com/in/madhukoseke/',            note: 'Teammate and senior data engineer. Useful professional connection for exchanging ideas on data engineering, platforms, and AI projects. His profile describes a focus on data platforms.' },
  { name: 'Claudio Olmedo',              url: 'https://www.linkedin.com/in/claudioolmedo-com',       note: 'One Dollar Computer and robotics. Discussed One Dollar Computer and robotics. His work focuses on making computing and STEM education more accessible. Follow up on low-cost computing, robotics, and hands-on technology education.' },
  { name: 'Mannan Shukla',               url: 'https://www.linkedin.com/in/mannanshukla',            note: 'Developer tools and deployment. Discussed the idea of bringing the tools a team builds together in one place. His profile highlights cloud-native engineering and Spawnpoint, a tool designed to help developers deploy software to the cloud through coding agents and MCP. Follow up on developer tooling and agent-driven deployment.' },
  { name: 'Sidra Miconi',                url: 'https://www.linkedin.com/in/sidramiconi',             note: 'AgentGlass founder. Founder of AgentGlass, focused on AI agent reliability and evaluation. A relevant connection for discussions about agent quality, testing, evaluation, and production readiness.' },
  { name: 'Aarsh Sheth',                 url: 'https://www.linkedin.com/in/aarsheth/',               note: 'Backend and distributed systems. Discussed backend engineering and distributed systems. A potential contact for exchanging ideas on scalable architectures, backend services, and infrastructure for AI applications.' },
  { name: 'Joshua Levy',                 url: 'https://www.linkedin.com/in/jlevy',                   note: 'Agent-to-agent communication. Discussed the idea of agents communicating and collaborating directly with other agents. Follow up on multi-agent architecture, agent handoffs, shared context, and practical agent-to-agent workflows.' },
  { name: 'Madhughnea Adabala',          url: 'https://www.linkedin.com/in/madhughnea/',             note: 'Teammate and UX. A teammate with a UX focus. Useful to collaborate with on improving user experience, product workflows, and the interface for AI-powered applications. His profile also highlights backend systems work.' },
  { name: 'Abhinav R Bharadwaj',         url: 'https://www.linkedin.com/in/abhinavrbharadwaj',       note: 'Full-stack and AI application development. Software engineer at Regilient, with experience in Python, the MERN stack, full-stack development, and AI applications. A potential connection for exchanging ideas on building scalable web applications and AI-powered products.' },
];

console.log('Importing notes from CSV...\n');
const now = Date.now();
let created = 0;
let notFound = 0;

for (let i = 0; i < csvRows.length; i++) {
  const row = csvRows[i];
  const noteText = clean(row.note);
  const ts = now + i;

  // First try exact URL
  let result = await q(
    `MATCH (p:Person {linkedin_url: $url})
     CREATE (n:Note {text: $text, created_at: $ts, source: 'csv_import'})
     CREATE (p)-[:HAS_NOTE]->(n)
     RETURN p.name AS name`,
    { url: row.url, text: noteText, ts }
  );

  // Try without trailing slash if not found
  if (result.length === 0) {
    const urlNoSlash = row.url.replace(/\/$/, '');
    result = await q(
      `MATCH (p:Person {linkedin_url: $url})
       CREATE (n:Note {text: $text, created_at: $ts, source: 'csv_import'})
       CREATE (p)-[:HAS_NOTE]->(n)
       RETURN p.name AS name`,
      { url: urlNoSlash, text: noteText, ts }
    );
  }

  if (result.length > 0) {
    console.log(`✓ ${result[0].name}`);
    created++;
  } else {
    console.log(`✗ NOT FOUND: ${row.name} @ ${row.url}`);
    notFound++;
  }
}

console.log(`\nDone. Created: ${created}, Not found: ${notFound}`);

// Verify
console.log('\nVerification:');
const verify = await q(`
  MATCH (p:Person)-[:HAS_NOTE]->(n:Note)
  RETURN p.name AS name, left(n.text, 70) AS snippet
  ORDER BY p.name
`);
verify.forEach(r => console.log(`  ${r.name}: ${r.snippet}`));

const counts = await q('MATCH ()-[r:HAS_NOTE]->() RETURN count(r) AS c');
console.log(`\nTotal HAS_NOTE: ${counts[0]?.c}`);

await client.close();
