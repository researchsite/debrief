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

console.log('=== All Sessions (SAW by Me) ===');
const sessions = await q(`
  MATCH (me:Me)-[:SAW]->(s:Session)
  OPTIONAL MATCH (s)-[:SPARKED]->(i:Idea)
  RETURN s.title AS title, s.at AS at, s.note AS note, count(i) AS ideaCount
  ORDER BY s.at
`);
sessions.forEach(r => console.log(`  [${r.title}] ideas=${r.ideaCount} note=${r.note ? '"'+String(r.note).substring(0,60)+'"' : 'none'}`));

console.log('\n=== All Ideas ===');
const ideas = await q('MATCH (i:Idea) RETURN i.text AS text LIMIT 20');
ideas.forEach(r => console.log(`  ${r.text}`));

console.log('\n=== All Session nodes (not just SAW) ===');
const allSessions = await q(`
  MATCH (s:Session)
  OPTIONAL MATCH (me:Me)-[:SAW]->(s)
  RETURN s.title AS title, s.at AS at, count{(s)-[:SPARKED]->(:Idea)} AS ideas, me IS NOT NULL AS saw
  ORDER BY s.at
  LIMIT 20
`);
allSessions.forEach(r => console.log(`  [${r.title}] saw=${r.saw} ideas=${r.ideas}`));

console.log('\n=== Conversation Nodes ===');
const convs = await q(`
  MATCH (c:Conversation)
  RETURN c.starts AS starts, c.summary AS summary, c.starts AS ts
  ORDER BY c.starts
  LIMIT 20
`);
convs.forEach(r => console.log(`  [${r.starts}] ${String(r.summary||'').substring(0,80)}`));

console.log('\n=== Recap counts ===');
const counts = await q(`
  MATCH (me:Me)
  OPTIONAL MATCH (me)-[:MET]->(p:Person)
  OPTIONAL MATCH (me)-[:SAW]->(s:Session)
  OPTIONAL MATCH (s)-[:SPARKED]->(i:Idea)
  RETURN count(DISTINCT p) AS met, count(DISTINCT s) AS saw, count(DISTINCT i) AS ideas
`);
console.log('  ', counts[0]);

await client.close();
