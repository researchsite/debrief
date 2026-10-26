/**
 * Create ideas/takeaways from conversation notes (CSV) and fix Conversation WITH links.
 * Each conversation's key topic becomes an Idea on a "Hackathon Conversations" Session.
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

// ── Step 1: Create a "Hackathon Conversations" Session ───────────────────────
console.log('[1] Creating Hackathon Conversations session...');
await q(`
  MERGE (s:Session {title: 'Hackathon Conversations'})
  SET s.at = $ts, s.note = 'Key topics and ideas from networking conversations at Patch the Conference Hackathon 2024.'
`, { ts: Date.now() });

// Link Me → SAW → session
await q(`
  MATCH (me:Me)
  MATCH (s:Session {title: 'Hackathon Conversations'})
  MERGE (me)-[:SAW]->(s)
`);

// Link to Event
await q(`
  MATCH (e:Event) WHERE e.url IS NULL OR e.url = ''
  MATCH (s:Session {title: 'Hackathon Conversations'})
  MERGE (s)-[:PART_OF]->(e)
`);
console.log('    Done.');

// ── Step 2: Create Ideas from conversation topics ────────────────────────────
const ideas = [
  { text: 'Explore AI-powered marketing event tools — Kasey at Bright Data is a potential collaborator', topic: 'marketing' },
  { text: 'FalkorDB cloud deployment — Liz highlighted dev-experience gaps worth addressing', topic: 'falkordb' },
  { text: 'Community tech events around food/water causes — Nancy Li can help organize', topic: 'community' },
  { text: 'Bright Data web scraping has LinkedIn limitations worth documenting', topic: 'brightdata' },
  { text: 'Qodo as a sponsor tool for developer events — Kunal Kushwaha is the contact', topic: 'developer-tools' },
  { text: 'Geospatial + AI overlap worth exploring with Shesha (data engineering background)', topic: 'geospatial' },
  { text: 'One Dollar Computer makes STEM education accessible — Claudio Olmedo building it', topic: 'education' },
  { text: 'Spawnpoint (Mannan) lets agents deploy software via MCP — strong AI agent angle', topic: 'agent-deployment' },
  { text: 'AgentGlass (Sidra) for AI agent reliability and evaluation — critical for production agents', topic: 'agent-quality' },
  { text: 'Agent-to-agent communication and handoffs — Joshua Levy exploring multi-agent architectures', topic: 'multi-agent' },
  { text: 'Scalable backend infrastructure is a bottleneck for AI apps — Aarsh Sheth potential collaborator', topic: 'infrastructure' },
  { text: 'UX is often the weakest link in AI products — Madhughnea bridges UX and backend', topic: 'ux' },
];

console.log('\n[2] Creating ideas...');
for (let i = 0; i < ideas.length; i++) {
  const { text, topic } = ideas[i];
  // Create Idea
  await q(
    `MATCH (s:Session {title: 'Hackathon Conversations'})
     MERGE (i:Idea {text: $text})
     MERGE (s)-[:SPARKED]->(i)`,
    { text }
  );
  // Tag with topic
  await q(
    `MATCH (i:Idea {text: $text})
     MERGE (t:Topic {name: $topic})
     MERGE (i)-[:ABOUT]->(t)`,
    { text, topic }
  );
  console.log(`    ✓ ${text.substring(0, 70)}`);
}

// ── Step 3: Fix Conversation→WITH links using CSV people ─────────────────────
// Map CSV person names to their linkedin_url for matching
const personMap = [
  { url: 'https://www.linkedin.com/in/kasey-johnson-08655b39/', keywords: ['marketing', 'event', 'bright data'] },
  { url: 'https://www.linkedin.com/in/lizz-zhang/',            keywords: ['falkordb', 'cloud', 'deployment', 'sdk'] },
  { url: 'https://www.linkedin.com/in/nancyli1/',               keywords: ['community', 'water', 'food', 'organizing'] },
  { url: 'https://www.linkedin.com/in/neil-ricci/',             keywords: ['bright data', 'web scraping', 'linkedin', 'scraping'] },
  { url: 'https://www.linkedin.com/in/kunal-kushwaha/',         keywords: ['kunal', 'qodo', 'amsterdam', 'sponsor'] },
  { url: 'https://www.linkedin.com/in/ssskr',                   keywords: ['geospatial', 'shesha'] },
  { url: 'https://www.linkedin.com/in/madhukoseke/',            keywords: ['madhu', 'data engineer', 'data platform'] },
  { url: 'https://www.linkedin.com/in/claudioolmedo-com',       keywords: ['one dollar computer', 'robotics', 'claudio', 'stem'] },
  { url: 'https://www.linkedin.com/in/mannanshukla',            keywords: ['spawnpoint', 'mannan', 'cloud-native', 'mcp'] },
  { url: 'https://www.linkedin.com/in/sidramiconi',             keywords: ['agentglass', 'sidra', 'agent reliability'] },
  { url: 'https://www.linkedin.com/in/aarsheth/',               keywords: ['distributed', 'backend', 'aarsh'] },
  { url: 'https://www.linkedin.com/in/jlevy',                   keywords: ['agent-to-agent', 'multi-agent', 'joshua'] },
  { url: 'https://www.linkedin.com/in/madhughnea/',             keywords: ['ux', 'madhughnea', 'user experience'] },
  { url: 'https://www.linkedin.com/in/abhinavrbharadwaj',       keywords: ['mern', 'regilient', 'abhinav', 'full-stack'] },
];

console.log('\n[3] Fetching all Conversation nodes...');
const convs = await q(`
  MATCH (c:Conversation)
  RETURN id(c) AS id, c.starts AS starts, c.summary AS summary
  ORDER BY c.starts
`);
console.log(`    Found ${convs.length} Conversations`);

let linked = 0;
for (const conv of convs) {
  const summary = String(conv.summary || '').toLowerCase();
  for (const person of personMap) {
    const matches = person.keywords.some(kw => summary.includes(kw));
    if (matches) {
      await q(
        `MATCH (c:Conversation) WHERE id(c) = $id
         MATCH (p:Person {linkedin_url: $url})
         MERGE (c)-[:WITH]->(p)`,
        { id: conv.id, url: person.url }
      );
      console.log(`    Linked conv[${conv.starts}] → ${person.url.split('/').slice(-2)[0]}`);
      linked++;
      break; // one WITH per conversation
    }
  }
}
console.log(`    Linked ${linked} of ${convs.length} conversations`);

// ── Step 4: Verify ───────────────────────────────────────────────────────────
console.log('\n[4] Verification...');
const counts = await q(`
  MATCH (me:Me)-[:SAW]->(s:Session)
  OPTIONAL MATCH (s)-[:SPARKED]->(i:Idea)
  RETURN s.title AS title, count(DISTINCT i) AS ideas
  ORDER BY ideas DESC
  LIMIT 5
`);
counts.forEach(r => console.log(`  Session: ${r.title} → ${r.ideas} ideas`));

const ideaTotal = await q('MATCH (me:Me)-[:SAW]->(s:Session)-[:SPARKED]->(i:Idea) RETURN count(DISTINCT i) AS c');
console.log(`  Total ideas visible in recap: ${ideaTotal[0]?.c}`);

await client.close();
console.log('\nDone.');
