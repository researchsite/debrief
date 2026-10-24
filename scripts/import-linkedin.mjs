import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import JSZip from 'jszip';
import { FalkorDB } from 'falkordb';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const graphName = 'conference';
const attendeeId = 'linkedin-owner';
const batchSize = 250;

function safeError(error) {
  const name = error instanceof Error ? error.name : 'Error';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return code ? `${name} (${String(code)})` : name;
}

function stableId(...parts) {
  return createHash('sha256').update(parts.join('\0')).digest('hex');
}

async function count(graph, cypher, params = {}) {
  const result = await graph.roQuery(cypher, { params });
  return Number(result.data?.[0]?.count ?? 0);
}

async function readCloudUrl() {
  const envFile = await readFile(path.join(projectRoot, '.env'), 'utf8');
  const line = envFile
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('FALKORDB_URL='));
  const url = line?.slice('FALKORDB_URL='.length).trim().replace(/^("|')(.*)\1$/, '$2');
  if (!url) throw new Error('Set FALKORDB_URL in the project .env file.');
  try {
    if (new URL(url).protocol !== 'falkors:') throw new Error();
  } catch {
    throw new Error('FALKORDB_URL must be the full falkors:// TLS URL from your FalkorDB lab.');
  }
  return url;
}

async function readCsv(zip, filename, firstHeader, requiredHeaders) {
  const entry = Object.values(zip.files).find(
    (file) => !file.dir && path.basename(file.name).toLowerCase() === filename.toLowerCase(),
  );
  if (!entry) throw new Error(`The archive is missing ${filename}.`);

  const parsed = Papa.parse(await entry.async('text'), {
    header: false,
    skipEmptyLines: 'greedy',
  });
  const headerIndex = parsed.data.findIndex(
    (row) => String(row[0] ?? '').replace(/^\uFEFF/, '').trim() === firstHeader,
  );
  if (headerIndex < 0) throw new Error(`Could not find the ${filename} header.`);

  const headers = parsed.data[headerIndex].map((value) => String(value ?? '').trim());
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new Error(`The ${filename} export is missing required columns.`);
  }

  return parsed.data
    .slice(headerIndex + 1)
    .map((values) => Object.fromEntries(
      headers.map((header, index) => [header, String(values[index] ?? '').trim()]),
    ))
    .filter((row) => Object.values(row).some(Boolean));
}

async function run() {
  const archivePath = process.argv[2];
  if (!archivePath) {
    throw new Error('Usage: npm run import:linkedin -- <LinkedIn export ZIP>');
  }

  const zip = await JSZip.loadAsync(await readFile(archivePath));
  const [profiles, positionRows, educationRows, skillRows, connectionRows] = await Promise.all([
    readCsv(zip, 'Profile.csv', 'First Name', ['First Name', 'Last Name', 'Headline']),
    readCsv(zip, 'Positions.csv', 'Company Name', ['Company Name', 'Title']),
    readCsv(zip, 'Education.csv', 'School Name', ['School Name']),
    readCsv(zip, 'Skills.csv', 'Name', ['Name']),
    readCsv(zip, 'Connections.csv', 'First Name', ['First Name', 'Last Name', 'URL']),
  ]);

  const profile = profiles[0];
  if (!profile) throw new Error('Profile.csv has no profile row.');
  const profileName = [profile['First Name'], profile['Last Name']].filter(Boolean).join(' ');
  if (!profileName) throw new Error('The LinkedIn export profile has no name.');

  const connectionsByUrl = new Map();
  for (const row of connectionRows) {
    const url = row.URL;
    const name = [row['First Name'], row['Last Name']].filter(Boolean).join(' ');
    if (!url || !name) continue;
    connectionsByUrl.set(url, {
      url,
      name,
      headline: row.Position,
      company: row.Company,
      connectedOn: row['Connected On'],
    });
  }
  const connections = [...connectionsByUrl.values()];

  const positions = positionRows
    .filter((row) => row['Company Name'] && row.Title)
    .map((row) => ({
      importId: stableId('position', row['Company Name'], row.Title, row['Started On'], row['Finished On'], row.Location),
      company: row['Company Name'],
      title: row.Title,
      location: row.Location,
      startedOn: row['Started On'],
      finishedOn: row['Finished On'],
    }));
  const education = educationRows
    .filter((row) => row['School Name'])
    .map((row) => ({
      importId: stableId('education', row['School Name'], row['Degree Name'], row['Start Date'], row['End Date']),
      school: row['School Name'],
      degree: row['Degree Name'],
      startedOn: row['Start Date'],
      finishedOn: row['End Date'],
    }));
  const skillsByKey = new Map();
  for (const row of skillRows) {
    const skill = row.Name;
    if (skill && !skillsByKey.has(skill.toLowerCase())) skillsByKey.set(skill.toLowerCase(), skill);
  }
  const skills = [...skillsByKey.values()];

  const db = await FalkorDB.connect({ url: await readCloudUrl() });
  try {
    const graph = db.selectGraph(graphName);
    const connectionResult = await graph.query('RETURN 1 AS connected');
    if (Number(connectionResult.data?.[0]?.connected) !== 1) {
      throw new Error('The FalkorDB connection query did not return 1.');
    }

    await graph.query(
      `MERGE (attendee:Attendee {id: $id})
       SET attendee.name = $name,
           attendee.headline = $headline,
           attendee.summary = $summary,
           attendee.industry = $industry,
           attendee.data_source = 'LinkedIn export'`,
      {
        params: {
          id: attendeeId,
          name: profileName,
          headline: profile.Headline,
          summary: profile.Summary,
          industry: profile.Industry,
        },
      },
    );

    for (const batch of chunk(positions, batchSize)) {
      await graph.query(
        `UNWIND $rows AS row
         MERGE (company:Company {name: row.company})
         WITH row, company
         MATCH (attendee:Attendee {id: $attendeeId})
         MERGE (attendee)-[work:WORKED_AT {import_id: row.importId}]->(company)
         SET work.title = row.title, work.location = row.location,
             work.started_on = row.startedOn, work.finished_on = row.finishedOn`,
        { params: { attendeeId, rows: batch } },
      );
    }

    for (const batch of chunk(education, batchSize)) {
      await graph.query(
        `UNWIND $rows AS row
         MERGE (school:School {name: row.school})
         WITH row, school
         MATCH (attendee:Attendee {id: $attendeeId})
         MERGE (attendee)-[studied:STUDIED_AT {import_id: row.importId}]->(school)
         SET studied.degree = row.degree, studied.started_on = row.startedOn,
             studied.finished_on = row.finishedOn`,
        { params: { attendeeId, rows: batch } },
      );
    }

    for (const batch of chunk(skills, batchSize)) {
      await graph.query(
        `UNWIND $skills AS skillName
         MERGE (topic:Topic {name: skillName})
         WITH topic
         MATCH (attendee:Attendee {id: $attendeeId})
         MERGE (attendee)-[:INTERESTED_IN]->(topic)`,
        { params: { attendeeId, skills: batch } },
      );
    }

    for (const batch of chunk(connections, batchSize)) {
      await graph.query(
        `UNWIND $rows AS row
         MERGE (person:Person {linkedin_url: row.url})
         SET person.name = row.name, person.headline = row.headline,
             person.connected_on = row.connectedOn,
             person.data_source = 'LinkedIn export'
         WITH person
         MATCH (attendee:Attendee {id: $attendeeId})
         MERGE (attendee)-[:CONNECTED_TO]->(person)`,
        { params: { attendeeId, rows: batch } },
      );

      const companyRows = batch.filter((row) => row.company);
      if (companyRows.length > 0) {
        await graph.query(
          `UNWIND $rows AS row
           MERGE (company:Company {name: row.company})
           WITH row, company
           MATCH (person:Person {linkedin_url: row.url})
           MERGE (person)-[:WORKS_AT]->(company)`,
          { params: { rows: companyRows } },
        );
      }
    }

    const graphCounts = {
      profiles: await count(graph, 'MATCH (attendee:Attendee {id: $attendeeId}) RETURN count(attendee) AS count', { attendeeId }),
      connections: await count(graph, 'MATCH (:Attendee {id: $attendeeId})-[edge:CONNECTED_TO]->(:Person) RETURN count(edge) AS count', { attendeeId }),
      workHistory: await count(graph, 'MATCH (:Attendee {id: $attendeeId})-[edge:WORKS_AT|WORKED_AT]->(:Company) RETURN count(edge) AS count', { attendeeId }),
      education: await count(graph, 'MATCH (:Attendee {id: $attendeeId})-[edge:STUDIED_AT]->(:School) RETURN count(edge) AS count', { attendeeId }),
      skills: await count(graph, 'MATCH (:Attendee {id: $attendeeId})-[edge:INTERESTED_IN]->(:Topic) RETURN count(edge) AS count', { attendeeId }),
    };
    if (graphCounts.profiles !== 1
      || graphCounts.connections < connections.length
      || graphCounts.workHistory < positions.length
      || graphCounts.education < education.length
      || graphCounts.skills < skills.length) {
      throw new Error('The graph does not contain all imported LinkedIn records.');
    }

    const pathResult = await graph.roQuery(
      `MATCH path = (attendee:Attendee {id: $attendeeId})
                    -[:CONNECTED_TO]->(person:Person)-[:WORKS_AT]->(company:Company)
       RETURN path
       LIMIT 1`,
      { params: { attendeeId } },
    );
    const path = pathResult.data?.[0];
    if (!path?.path) {
      throw new Error('The LinkedIn connection-to-company path query returned no path.');
    }

    console.log(`LinkedIn data added to ${graphName} (sample conference data preserved).`);
    console.log(`Profile: 1; work history: ${positions.length}; education: ${education.length}; skills: ${skills.length}; connections: ${connections.length}.`);
    console.log(`Stored links: ${graphCounts.connections} connections, ${graphCounts.workHistory} work history, ${graphCounts.education} education, ${graphCounts.skills} skills.`);
    console.log('PASS Personalized path: profile -> LinkedIn connection -> company.');
  } finally {
    await db.close();
  }
}

function chunk(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

run().catch((error) => {
  console.error(`LinkedIn import failed: ${safeError(error)}. No personal values were logged.`);
  process.exitCode = 1;
});
