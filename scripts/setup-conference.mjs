import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { FalkorDB } from 'falkordb';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = await readFile(path.join(projectRoot, '.env'), 'utf8');
const connectionLine = envFile
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line.startsWith('FALKORDB_URL='));
const connectionUrl = connectionLine
  ?.slice('FALKORDB_URL='.length)
  .trim()
  .replace(/^("|')(.*)\1$/, '$2');

if (!connectionUrl) {
  throw new Error('Set FALKORDB_URL in the project .env file.');
}

try {
  if (new URL(connectionUrl).protocol !== 'falkors:') {
    throw new Error('FALKORDB_URL must use the falkors:// TLS URL from your lab.');
  }
} catch (error) {
  if (error instanceof TypeError) {
    throw new Error('FALKORDB_URL must be a valid falkors:// URL from your lab.');
  }
  throw error;
}

const checks = { connection: false, data: false, path: false };
const graphName = 'conference';
const attendeeId = 'sample-attendee';
let db;

async function count(cypher) {
  const result = await db.selectGraph(graphName).roQuery(cypher);
  return Number(result.data?.[0]?.count ?? 0);
}

function safeError(error) {
  const name = error instanceof Error ? error.name : 'Error';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;
  return code ? `${name} (${String(code)})` : name;
}

try {
  db = await FalkorDB.connect({ url: connectionUrl });
  const graph = db.selectGraph(graphName);
  const connectionResult = await graph.query('RETURN 1 AS connected');
  if (Number(connectionResult.data?.[0]?.connected) !== 1) {
    throw new Error('The connection query returned no result.');
  }
  checks.connection = true;

  await graph.query(
    `MERGE (attendee:Attendee {id: $attendeeId})
     SET attendee.name = 'Demo Attendee', attendee.sample_data = true
     MERGE (topic:Topic {id: 'topic-agent-memory'})
     SET topic.name = 'Graph Memory', topic.sample_data = true
     MERGE (talk:Talk {id: 'talk-graph-memory'})
     SET talk.title = 'Memory That Lasts: Agent Graphs at Conferences', talk.starts = '11:00 AM', talk.sample_data = true
     MERGE (speaker:Speaker {id: 'speaker-morgan-chen'})
     SET speaker.name = 'Morgan Chen', speaker.title = 'Graph AI Engineer', speaker.sample_data = true
     MERGE (room:Room {id: 'room-main-stage'})
     SET room.name = 'Main Stage', room.sample_data = true
     MERGE (speaker)-[presents:PRESENTS]->(talk)
     SET presents.sample_data = true
     MERGE (talk)-[about:ABOUT]->(topic)
     SET about.sample_data = true
     MERGE (talk)-[inRoom:IN_ROOM]->(room)
     SET inRoom.sample_data = true
     MERGE (attendee)-[interest:INTERESTED_IN]->(topic)
     SET interest.sample_data = true
     MERGE (attendee)-[met:MET]->(speaker)
     SET met.sample_data = true`,
    { params: { attendeeId } },
  );

  const labels = ['Talk', 'Speaker', 'Topic', 'Room', 'Attendee'];
  const relationships = ['PRESENTS', 'ABOUT', 'IN_ROOM', 'INTERESTED_IN', 'MET'];
  const nodeCounts = Object.fromEntries(
    await Promise.all(
      labels.map(async (label) => [
        label,
        await count(`MATCH (node:${label}) RETURN count(node) AS count`),
      ]),
    ),
  );
  const edgeCounts = Object.fromEntries(
    await Promise.all(
      relationships.map(async (type) => [
        type,
        await count(`MATCH ()-[edge:${type}]->() RETURN count(edge) AS count`),
      ]),
    ),
  );
  const totalNodes = Object.values(nodeCounts).reduce((total, value) => total + value, 0);
  const totalEdges = Object.values(edgeCounts).reduce((total, value) => total + value, 0);
  if (labels.some((label) => nodeCounts[label] < 1)
    || relationships.some((type) => edgeCounts[type] < 1)) {
    throw new Error('Expected conference nodes or relationships are missing.');
  }
  checks.data = true;

  const pathResult = await graph.roQuery(
    `MATCH path = (attendee:Attendee {id: $attendeeId})-[:INTERESTED_IN]->(topic:Topic)
                  <-[:ABOUT]-(talk:Talk)<-[:PRESENTS]-(speaker:Speaker)
     RETURN path, attendee.name AS attendee, topic.name AS topic,
            talk.title AS talk, speaker.name AS speaker
     LIMIT 1`,
    { params: { attendeeId } },
  );
  const path = pathResult.data?.[0];
  if (!path?.path) {
    throw new Error('The attendee-to-topic-to-talk-to-speaker path query returned no path.');
  }
  checks.path = true;

  console.log('PASS Connection: FALKORDB_URL loaded from .env; RETURN 1 returned 1.');
  console.log(`PASS Data: ${graphName} has ${totalNodes} nodes and ${totalEdges} edges.`);
  for (const label of labels) console.log(`  ${label}: ${nodeCounts[label]}`);
  for (const type of relationships) console.log(`  ${type}: ${edgeCounts[type]}`);
  console.log('PASS Path query: returned a multi-hop path.');
  console.log(`  ${path.attendee} -> ${path.topic} -> ${path.talk} -> ${path.speaker}`);
} catch (error) {
  const detail = safeError(error);
  if (!checks.connection) console.log(`FAIL Connection: ${detail}`);
  else if (!checks.data) console.log(`FAIL Data: ${detail}`);
  else console.log(`FAIL Path query: ${detail}`);
  for (const [name, passed] of Object.entries(checks)) {
    if (!passed && name !== 'connection') console.log(`FAIL ${name === 'data' ? 'Data' : 'Path query'}: not completed.`);
  }
  process.exitCode = 1;
} finally {
  await db?.close();
}
