/**
 * Fix display names for people met at the event.
 * Names from transcript were saved as URL slugs — update to proper names from CSV.
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

const fixes = [
  { url: 'https://www.linkedin.com/in/kasey-johnson-08655b39/', name: 'Kasey Johnson' },
  { url: 'https://www.linkedin.com/in/lizz-zhang/',            name: 'Lizz Zhang' },
  { url: 'https://www.linkedin.com/in/nancyli1/',               name: 'Nancy Li' },
  { url: 'https://www.linkedin.com/in/neil-ricci/',             name: 'Neil Ricci' },
  { url: 'https://www.linkedin.com/in/kunal-kushwaha/',         name: 'Kunal Kushwaha' },
  { url: 'https://www.linkedin.com/in/madhukoseke/',            name: 'Madhu Koseke' },
  { url: 'https://www.linkedin.com/in/aarsheth/',               name: 'Aarsh Sheth' },
  { url: 'https://www.linkedin.com/in/madhughnea/',             name: 'Madhughnea Adabala' },
];

for (const { url, name } of fixes) {
  const r = await q(
    'MATCH (p:Person {linkedin_url: $url}) SET p.name = $name RETURN p.name AS name',
    { url, name }
  );
  if (r.length > 0) {
    console.log(`✓ Updated: ${r[0].name}`);
  } else {
    // Try without trailing slash
    const url2 = url.replace(/\/$/, '');
    const r2 = await q(
      'MATCH (p:Person {linkedin_url: $url}) SET p.name = $name RETURN p.name AS name',
      { url: url2, name }
    );
    if (r2.length > 0) {
      console.log(`✓ Updated (no slash): ${r2[0].name}`);
    } else {
      console.log(`✗ Not found: ${url}`);
    }
  }
}

console.log('\nFinal people met:');
const people = await q(`
  MATCH (me:Me)-[:MET]->(p:Person)
  RETURN p.name AS name, p.linkedin_url AS url
  ORDER BY p.name
`);
people.forEach(r => console.log(`  ${r.name}`));

await client.close();
