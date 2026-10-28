/**
 * update-photo-urls.mjs
 * Sets photo_url on Person nodes in the debrief graph.
 * Matches by linkedin_url where known, falls back to name.
 *
 * Usage:
 *   node scripts/update-photo-urls.mjs
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

// Match by linkedin_url (with and without trailing slash)
async function setByUrl(url, photo) {
  for (const u of [url, url.replace(/\/$/, ''), url + '/']) {
    const r = await q(
      'MATCH (p:Person {linkedin_url: $u}) SET p.photo_url = $photo RETURN p.name AS name',
      { u, photo }
    );
    if (r.length > 0) return r[0].name;
  }
  return null;
}

// Match by name (case-insensitive partial)
async function setByName(name, photo) {
  const r = await q(
    'MATCH (p:Person) WHERE toLower(p.name) CONTAINS toLower($name) SET p.photo_url = $photo RETURN p.name AS name',
    { name, photo }
  );
  return r.length > 0 ? r.map(x => x.name).join(', ') : null;
}

const updates = [
  // -- Team members --
  {
    url:   'https://www.linkedin.com/in/madhukoseke/',
    photo: 'https://media.licdn.com/dms/image/v2/D5635AQE0dBtiqBz_Xw/profile-framedphoto-shrink_800_800/B56aEMdBtGIMAY-/0/1791210298536?e=1793757600&v=beta&t=2IBv9KOPJqmpkW6jVolcanPUsSWSGhypHAFWchhV_jg',
  },
  {
    url:   'https://www.linkedin.com/in/madhughnea/',
    photo: 'https://media.licdn.com/dms/image/v2/D4E03AQGrushCp9OcAQ/profile-displayphoto-crop_800_800/B4EZv5SL5zHoAI-/0/1769413853213?e=1795046400&v=beta&t=Tj7ZsHqU_EDwEI8-4rRYIY8ke2dGQmbyo4JmFJnGieo',
  },
  // -- Sponsor contacts --
  {
    url:   'https://www.linkedin.com/in/kasey-johnson-08655b39/',
    photo: 'https://media.licdn.com/dms/image/v2/C5603AQFZE6d8EoEE4g/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1516819746085?e=1795046400&v=beta&t=Zbnnil9JvVC5NbFdRpTJ82rO3_djxmagQ5iqB3CsSII',
  },
  {
    url:   'https://www.linkedin.com/in/lizz-zhang/',
    photo: 'https://media.licdn.com/dms/image/v2/D5603AQG0DOzM3BbyCw/profile-displayphoto-crop_800_800/B56aDVxyhcJIAI-/0/1790292996682?e=1795046400&v=beta&t=rl3GSrSLx4xaVu9cKlc7-rfByqgptLFnLveEY9Y7c9Y',
  },
  {
    url:   'https://www.linkedin.com/in/kunal-kushwaha/',
    photo: 'https://media.licdn.com/dms/image/v2/D5603AQEkN21kXiTfag/profile-displayphoto-crop_800_800/B56ZtiGLOyGsAI-/0/1766877345478?e=1795046400&v=beta&t=28DfZjSsFOAAj5TfqpYtGXuTRN4cJL-4TZ0AfAC5Xl0',
  },
  // -- People met at conference --
  {
    url:   'https://www.linkedin.com/in/jlevy/',
    photo: 'https://media.licdn.com/dms/image/v2/C5603AQF_FqaCNkMFlw/profile-displayphoto-shrink_800_800/profile-displayphoto-shrink_800_800/0/1548728845337?e=1795046400&v=beta&t=jbCr2yxBQXZ6NOY53-QLUu1DugNNbDoBgM-nguh1-2c',
  },
  {
    url:   'https://www.linkedin.com/in/mannanshukla/',
    photo: 'https://media.licdn.com/dms/image/v2/D4E03AQGi88V9TxEXng/profile-displayphoto-crop_800_800/B4EZ_V147FKQAI-/0/1785999104184?e=1795046400&v=beta&t=AikzrN99ynOjQLHFsi0BWhGRI0XSioRtyUQ6lF3DwJY',
  },
  {
    url:   'https://www.linkedin.com/in/claudioolmedo-com/',
    photo: 'https://media.licdn.com/dms/image/v2/D5603AQFutNrOGT_mBQ/profile-displayphoto-crop_800_800/B56Z9MnLBCGsAI-/0/1783696766954?e=1795046400&v=beta&t=YK6MpoHPSFDy05hzz03PMoUrYMUk2bV-MCsS77xPHHA',
  },
  {
    url:   'https://www.linkedin.com/in/aarsheth/',
    photo: 'https://media.licdn.com/dms/image/v2/D5603AQFNjxqjxOBkpA/profile-displayphoto-crop_800_800/B56aBLDUq1IcAI-/0/1787965559517?e=1795046400&v=beta&t=dJ23TR5zIJYSf32cIr7BE0oJw77k9PUJTut73Gxo-kI',
  },
  // -- Name-only matches (no confirmed LinkedIn URL in graph yet) --
  {
    name:  'Shesha',
    photo: 'https://media.licdn.com/dms/image/v2/D5635AQFIKAyCNertBA/profile-framedphoto-shrink_800_800/profile-framedphoto-shrink_800_800/0/1719885102253?e=1793757600&v=beta&t=kZ6pX7IUgr5d6RYrth9w6Zi7mjmfSXGrJ6595jmFWzk',
  },
  {
    name:  'Abhinav',
    photo: 'https://media.licdn.com/dms/image/v2/D5603AQHsM-ZlsR0LaQ/profile-displayphoto-crop_800_800/B56Z9B3Up8HYAI-/0/1783516451103?e=1795046400&v=beta&t=O0uRbK1k4vZuVwByspHN3EG9dyY4QDn20Mmi3hkhI1w',
  },
  // Nancy Li, Neil Ricci, Sidra Miconi — no direct image URL provided, skipped
];

console.log('Updating photo_url on Person nodes in graph: debrief\n');

for (const u of updates) {
  let result = null;
  if (u.url) {
    result = await setByUrl(u.url, u.photo);
  } else if (u.name) {
    result = await setByName(u.name, u.photo);
  }
  const label = u.url ?? u.name;
  if (result) {
    console.log(`✓ ${result}`);
  } else {
    console.log(`✗ Not found: ${label}`);
  }
}

console.log('\nAll Person nodes with photo_url set:');
const all = await q(`
  MATCH (p:Person) WHERE p.photo_url IS NOT NULL AND p.photo_url <> ''
  RETURN p.name AS name, p.photo_url AS photo
  ORDER BY p.name
`);
all.forEach(r => console.log(`  ${r.name}`));

await client.close();
