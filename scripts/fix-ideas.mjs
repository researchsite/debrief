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

// Delete ALL existing ideas and Topic links
console.log('Deleting existing ideas...');
const del1 = await q('MATCH ()-[r:SPARKED]->() DELETE r RETURN count(r) AS c');
console.log('  deleted SPARKED:', del1[0]?.c);
const del2 = await q('MATCH (i:Idea) DETACH DELETE i RETURN count(i) AS c');
console.log('  deleted Ideas:', del2[0]?.c);

// Ideas extracted directly from what was discussed in each conversation
const ideas = [
  { text: 'Agent-to-agent communication for multi-agent workflows', topic: 'agents' },
  { text: 'One Dollar Computer for son\'s robotics and STEM project', topic: 'robotics' },
  { text: 'AgentGlass for evaluating AI agent reliability in production', topic: 'agents' },
  { text: 'Spawnpoint: deploy software to cloud via coding agents and MCP', topic: 'deployment' },
  { text: 'Use Bright Data for LinkedIn web scraping workflows', topic: 'brightdata' },
  { text: 'FalkorDB SDK vs API: improve developer experience for cloud deployment', topic: 'falkordb' },
  { text: 'Organize community tech events (water and food causes) with Nancy Li', topic: 'community' },
  { text: 'Geospatial + AI overlap worth exploring', topic: 'geospatial' },
  { text: 'Qodo developer tools from hackathon sponsor', topic: 'developer-tools' },
  { text: 'Scalable backend architecture for AI applications', topic: 'infrastructure' },
];

console.log('\nCreating new ideas...');
for (const { text, topic } of ideas) {
  await q(
    `MATCH (s:Session {title: 'Hackathon Conversations'})
     MERGE (i:Idea {text: $text})
     MERGE (s)-[:SPARKED]->(i)`,
    { text }
  );
  await q(
    `MATCH (i:Idea {text: $text})
     MERGE (t:Topic {name: $topic})
     MERGE (i)-[:ABOUT]->(t)`,
    { text, topic }
  );
  console.log('  •', text);
}

const total = await q('MATCH (me:Me)-[:SAW]->(s:Session)-[:SPARKED]->(i:Idea) RETURN count(DISTINCT i) AS c');
console.log(`\nTotal ideas in recap: ${total[0]?.c}`);

await client.close();
