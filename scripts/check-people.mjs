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

console.log('\n=== All Person nodes ===');
const people = await q('MATCH (p:Person) RETURN p.name AS name, p.linkedin_url AS url ORDER BY name');
people.forEach(r => console.log(`  [${r.name}] ${r.url}`));

console.log('\n=== MET relationships ===');
const met = await q('MATCH (me:Me)-[:MET]->(p:Person) RETURN p.name AS name, p.linkedin_url AS url');
met.forEach(r => console.log(`  ${r.name}`));

console.log('\n=== Sessions ===');
const sessions = await q('MATCH (s:Session) RETURN s.title AS title, s.id AS id, count{(s)-[:SPARKED]->(:Idea)} AS ideas LIMIT 20');
sessions.forEach(r => console.log(`  ${r.title} [${r.id}]: ${r.ideas} ideas`));

console.log('\n=== All Note count ===');
const notes = await q('MATCH (n:Note) RETURN count(n) AS c');
console.log('  Total:', notes[0]?.c);

await client.close();
