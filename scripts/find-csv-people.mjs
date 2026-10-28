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
  const r = await graph.query(cypher, params);
  return r.data ?? [];
}

// Search for people with partial name matches (case insensitive via toLower)
const searches = [
  'kasey', 'liz', 'lizz', 'zhang', 'nancy li', 'nancyli', 'neil ricci', 'neil',
  'kunal', 'shesha', 'madhu', 'olmedo', 'claudio', 'mannan', 'sidra', 'aarsh',
  'joshua', 'madhugh', 'abhinav'
];

console.log('=== Event-met people (MET from Me) ===');
const met = await q(`
  MATCH (me:Me)-[:MET]->(p:Person)
  RETURN p.name AS name, p.linkedin_url AS url, p.photo_url AS photo
  ORDER BY p.name
`);
met.forEach(r => console.log(`  [${r.name}] ${r.url} | photo: ${r.photo ? 'YES' : 'no'}`));

console.log('\n=== Person nodes with fuzzy name search ===');
// Look for each of the CSV people
const csvNames = [
  'Kasey Johnson', 'Liz Zhang', 'Lizz Zhang', 'Nancy Li', 'Neil Ricci',
  'Kunal Kushwaha', 'Shesha Sai Kumar Reddy Sadu', 'Madhu Koseke',
  'Claudio Olmedo', 'ClaudIO Olmedo', 'Mannan Shukla', 'Sidra Miconi',
  'Aarsh Sheth', 'Joshua Levy', 'Madhughnea Adabala', 'Abhinav R Bharadwaj'
];

for (const name of csvNames) {
  const lname = name.toLowerCase().split(' ')[0];
  const rows = await q(
    `MATCH (p:Person) WHERE toLower(p.name) CONTAINS $n RETURN p.name AS name, p.linkedin_url AS url LIMIT 3`,
    { n: lname }
  );
  if (rows.length > 0) {
    rows.forEach(r => console.log(`  CSV "${name}" → [${r.name}] ${r.url}`));
  } else {
    console.log(`  CSV "${name}" → NOT FOUND`);
  }
}

await client.close();
