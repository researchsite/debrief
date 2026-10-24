import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { FalkorDB } from 'falkordb';

// Load this project's .env explicitly, independent of the working directory.
const { FALKORDB_URL } = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const pathQuery = `
MATCH p=(me:Attendee {id: 'ptc-madhu'})-[:MET]->(peer:Attendee)
        -[:INTERESTED_IN]->(topic:Topic)<-[:ABOUT]-(talk:Talk)-[:IN_ROOM]->(room:Room)
RETURN p, talk.name AS talk, room.name AS room
ORDER BY talk, room
`;

const nodes = [
  ['Attendee', 'ptc-madhu', 'Madhu'],
  ['Attendee', 'ptc-alex', 'Alex'],
  ['Speaker', 'ptc-maya', 'Maya Chen'],
  ['Speaker', 'ptc-sam', 'Sam Rivera'],
  ['Topic', 'ptc-graphs', 'Knowledge Graphs'],
  ['Topic', 'ptc-agents', 'AI Agents'],
  ['Room', 'ptc-main', 'Main Hall'],
  ['Room', 'ptc-lab', 'Agent Lab'],
  ['Talk', 'ptc-graphrag', 'GraphRAG with FalkorDB'],
  ['Talk', 'ptc-memory', 'Memory for AI Agents'],
];
const edges = [
  ['ptc-maya', 'PRESENTS', 'ptc-graphrag'],
  ['ptc-sam', 'PRESENTS', 'ptc-memory'],
  ['ptc-graphrag', 'ABOUT', 'ptc-graphs'],
  ['ptc-memory', 'ABOUT', 'ptc-agents'],
  ['ptc-graphrag', 'IN_ROOM', 'ptc-main'],
  ['ptc-memory', 'IN_ROOM', 'ptc-lab'],
  ['ptc-madhu', 'INTERESTED_IN', 'ptc-agents'],
  ['ptc-alex', 'INTERESTED_IN', 'ptc-graphs'],
  ['ptc-madhu', 'MET', 'ptc-alex'],
];

let db;
let stage = 'Connection';
const deadline = setTimeout(() => {
  console.error(`FAIL ${stage}: setup exceeded 60 seconds.`);
  process.exit(1);
}, 60_000);

function readablePath(path) {
  let result = `${path.nodes[0].labels[0]}(${path.nodes[0].properties.name})`;
  path.edges.forEach((edge, i) => {
    const next = path.nodes[i + 1];
    const forward = edge.sourceId === path.nodes[i].id;
    result += forward ? ` -[${edge.relationshipType}]-> ` : ` <-[${edge.relationshipType}]- `;
    result += `${next.labels[0]}(${next.properties.name})`;
  });
  return result;
}

try {
  assert.ok(FALKORDB_URL, 'FALKORDB_URL is missing from .env');
  assert.equal(new URL(FALKORDB_URL).protocol, 'falkors:', 'Expected a TLS falkors:// URL');
  db = await FalkorDB.connect({
    url: FALKORDB_URL,
    socket: { connectTimeout: 10_000, reconnectStrategy: false },
  });
  db.on('error', () => console.error('FalkorDB connection error (credentials omitted).'));
  const graph = db.selectGraph('conference');
  const connection = await graph.query('RETURN 1 AS ok');
  assert.equal(connection.data?.[0]?.ok, 1);
  console.log('PASS Connection: .env loaded; full falkors:// URL connected with TLS; RETURN 1 = 1.');

  stage = 'Data';
  // Only merge our demo IDs; preserve any existing conference data.
  for (const [label, id, name] of nodes) {
    await graph.query(`MERGE (n:${label} {id: $id}) SET n.name = $name`, { params: { id, name } });
  }
  for (const [source, type, target] of edges) {
    await graph.query(`MATCH (a {id: $source}), (b {id: $target}) MERGE (a)-[:${type}]->(b)`, {
      params: { source, target },
    });
  }

  const nodeCounts = await graph.query('MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY label');
  const edgeCounts = await graph.query('MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY type');
  const totalNodes = await graph.query('MATCH (n) RETURN count(n) AS count');
  const totalEdges = await graph.query('MATCH ()-[r]->() RETURN count(r) AS count');
  for (const label of new Set(nodes.map(([label]) => label))) {
    assert.ok(nodeCounts.data.some((row) => row.label === label && row.count >= 2), `Missing ${label} nodes`);
  }
  for (const type of new Set(edges.map(([, type]) => type))) {
    assert.ok(edgeCounts.data.some((row) => row.type === type && row.count >= 1), `Missing ${type} edges`);
  }
  // Verify every specific demo relationship, not just aggregate counts.
  for (const [source, type, target] of edges) {
    const result = await graph.query(`MATCH ({id: $source})-[r:${type}]->({id: $target}) RETURN count(r) AS count`, {
      params: { source, target },
    });
    assert.equal(result.data[0].count, 1, `Expected exactly one demo ${type} relationship`);
  }
  console.log(`PASS Data: conference has ${totalNodes.data[0].count} nodes and ${totalEdges.data[0].count} edges.`);
  console.table(nodeCounts.data);
  console.table(edgeCounts.data);

  stage = 'Path query';
  const paths = await graph.query(pathQuery);
  assert.ok(paths.data?.length > 0, 'Multi-hop query returned no paths');
  for (const row of paths.data) {
    assert.equal(row.p.edges.length, 4);
    assert.equal(row.p.nodes.length, 5);
    console.log(`Answer: ${row.talk} in ${row.room}`);
    console.log(`Path: ${readablePath(row.p)}`);
  }
  console.log(`PASS Path query: ${paths.data.length} path(s), each with 4 hops.`);
  console.log(`\nBrowser Cypher:\n${pathQuery.trim()}`);
} catch (error) {
  // Do not print raw connection objects, URLs, or credentials.
  let message = String(error.message);
  if (FALKORDB_URL) {
    message = message.split(FALKORDB_URL).join('[REDACTED_URL]');
    const password = new URL(FALKORDB_URL).password;
    if (password) message = message.split(password).join('[REDACTED]');
  }
  console.error(`FAIL ${stage}: ${message}`);
  process.exitCode = 1;
} finally {
  if (db) await db.close();
  clearTimeout(deadline);
}
