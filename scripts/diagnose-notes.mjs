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

console.log('\n=== HAS_NOTE per Person ===');
const perPerson = await q(`
  MATCH (p:Person)-[:HAS_NOTE]->(n:Note)
  RETURN p.name AS name, count(n) AS notes
  ORDER BY notes DESC
`);
perPerson.forEach(r => console.log(`  ${r.name}: ${r.notes} notes`));

console.log('\n=== Total HAS_NOTE ===');
const total = await q('MATCH ()-[r:HAS_NOTE]->() RETURN count(r) AS c');
console.log(' ', total[0]?.c);

console.log('\n=== Total PRODUCED (Conversation→Note) ===');
const prod = await q('MATCH ()-[r:PRODUCED]->() RETURN count(r) AS c');
console.log(' ', prod[0]?.c);

console.log('\n=== Sample notes (first 20) ===');
const notes = await q(`
  MATCH (p:Person)-[:HAS_NOTE]->(n:Note)
  RETURN p.name AS person, left(n.text, 80) AS snippet, n.created_at AS ts
  ORDER BY ts
  LIMIT 20
`);
notes.forEach(r => console.log(`  [${r.person}] ${r.snippet}`));

console.log('\n=== Orphaned Notes (no HAS_NOTE) ===');
const orphans = await q(`
  MATCH (n:Note)
  WHERE NOT (()-[:HAS_NOTE]->(n)) AND NOT (()-[:PRODUCED]->(n))
  RETURN count(n) AS c
`);
console.log(' ', orphans[0]?.c);

console.log('\n=== Conversations with WITH ===');
const convWith = await q(`
  MATCH (c:Conversation)-[:WITH]->(p:Person)
  RETURN c.starts AS starts, p.name AS person, c.summary AS summary
  ORDER BY c.starts
`);
convWith.forEach(r => console.log(`  [${r.starts}] ${r.person}: ${(r.summary||'').substring(0,60)}`));

console.log('\n=== Ideas ===');
const ideas = await q('MATCH (i:Idea) RETURN count(i) AS c');
console.log('  Total ideas:', ideas[0]?.c);
const sparks = await q('MATCH (s)-[:SPARKED]->(i:Idea) RETURN count(i) AS c');
console.log('  SPARKED links:', sparks[0]?.c);

console.log('\n=== isHiring persons ===');
const hiring = await q('MATCH (p:Person) WHERE p.isHiring = true RETURN p.name AS name, p.linkedin_url AS url');
hiring.forEach(r => console.log(`  ${r.name} (${r.url})`));

await client.close();
