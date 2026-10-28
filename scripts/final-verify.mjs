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

console.log('=== Recap Counts ===');
const [metR, sawR, ideasR] = await Promise.all([
  q('MATCH (me:Me)-[:MET]->(p:Person) RETURN count(p) AS c'),
  q('MATCH (me:Me)-[:SAW]->(s:Session) RETURN count(s) AS c'),
  q('MATCH (me:Me)-[:SAW]->(s:Session)-[:SPARKED]->(i:Idea) RETURN count(DISTINCT i) AS c'),
]);
console.log(`  People met: ${metR[0]?.c}`);
console.log(`  Sessions saw: ${sawR[0]?.c}`);
console.log(`  Ideas: ${ideasR[0]?.c}`);

console.log('\n=== People met + notes ===');
const people = await q(`
  MATCH (me:Me)-[:MET]->(p:Person)
  OPTIONAL MATCH (p)-[:HAS_NOTE]->(n:Note)
  RETURN p.name AS name, n.text IS NOT NULL AS hasNote, left(n.text, 60) AS snippet
  ORDER BY p.name
`);
people.forEach(r => console.log(`  ${r.hasNote ? '✓' : '✗'} ${r.name}: ${r.snippet || '(no note)'}`));

console.log('\n=== Ideas ===');
const ideas = await q(`
  MATCH (me:Me)-[:SAW]->(s:Session)-[:SPARKED]->(i:Idea)
  RETURN i.text AS text
  ORDER BY i.text
`);
ideas.forEach(r => console.log(`  • ${r.text}`));

console.log('\n=== isHiring ===');
const hiring = await q('MATCH (p:Person) WHERE p.isHiring = true RETURN p.name AS name');
console.log(`  ${hiring.map(r => r.name).join(', ') || 'none'}`);

console.log('\n=== Photo status ===');
const photos = await q(`
  MATCH (me:Me)-[:MET]->(p:Person)
  RETURN p.name AS name, p.photo_url AS photo
  ORDER BY p.name
`);
const withPhoto = photos.filter(r => r.photo);
const noPhoto = photos.filter(r => !r.photo);
console.log(`  With photo: ${withPhoto.length} — ${withPhoto.map(r=>r.name).join(', ')}`);
console.log(`  No photo: ${noPhoto.length} — ${noPhoto.map(r=>r.name).join(', ')}`);

await client.close();
