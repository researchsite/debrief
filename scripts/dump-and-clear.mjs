/**
 * Dumps the entire `debrief` graph to a local JSON file, then deletes all nodes.
 * Run: node scripts/dump-and-clear.mjs
 *
 * Backup is saved to: _private/db-backup/debrief-<timestamp>.json
 * That file is gitignored via _private/.
 */
import { createRequire } from 'module';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { FalkorDB } = require('falkordb');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const GRAPH_NAME = 'debrief';
const BACKUP_DIR = join(ROOT, '_private', 'db-backup');

// ── Load .env.local ────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) {
    console.error('ERROR: .env.local not found');
    process.exit(1);
  }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadEnv();

// ── Connect ────────────────────────────────────────────────────────────────

async function connect() {
  const url = process.env.FALKORDB_URL;
  if (url) return FalkorDB.connect({ url });
  const host = process.env.FALKORDB_HOST ?? 'localhost';
  const port = parseInt(process.env.FALKORDB_PORT ?? '6379', 10);
  const ssl  = process.env.FALKORDB_SSL === 'true';
  const username = process.env.FALKORDB_USERNAME;
  const password = process.env.FALKORDB_PASSWORD;
  return FalkorDB.connect({
    socket: { host, port, tls: ssl },
    ...(username && { username }),
    ...(password && { password }),
  });
}

// ── Query helpers ──────────────────────────────────────────────────────────

async function q(graph, cypher, params = {}) {
  const res = await graph.query(cypher, { params });
  return res.data ?? [];
}

// ── Dump all node types ────────────────────────────────────────────────────

const NODE_LABELS = [
  'Me', 'Event', 'Person', 'Company', 'Session',
  'Idea', 'Topic', 'Skill', 'School', 'Note',
  'Context', 'Source', 'Coupon', 'Asset',
  'Transcript', 'Conversation', 'FollowUp',
  'Role', 'Intent', 'Project', 'ProjectAnalysis',
];

async function dumpNodes(graph) {
  const nodes = {};
  for (const label of NODE_LABELS) {
    const rows = await q(graph, `MATCH (n:${label}) RETURN id(n) AS id, properties(n) AS props`);
    nodes[label] = rows.map((r) => ({
      _id: String(r.id ?? ''),
      ...Object.fromEntries(
        Object.entries(r.props ?? {}).map(([k, v]) => [k, v]),
      ),
    }));
    if (rows.length > 0) console.log(`  ${label}: ${rows.length} nodes`);
  }
  return nodes;
}

async function dumpRelationships(graph) {
  const rows = await q(
    graph,
    `MATCH (a)-[r]->(b)
     RETURN id(a) AS src, labels(a) AS srcLabels,
            type(r) AS rel, properties(r) AS relProps,
            id(b) AS dst, labels(b) AS dstLabels`,
  );
  console.log(`  Relationships: ${rows.length} total`);
  return rows.map((r) => ({
    src: String(r.src ?? ''),
    srcLabel: Array.isArray(r.srcLabels) ? r.srcLabels[0] : String(r.srcLabels ?? ''),
    rel: String(r.rel ?? ''),
    relProps: r.relProps ?? {},
    dst: String(r.dst ?? ''),
    dstLabel: Array.isArray(r.dstLabels) ? r.dstLabels[0] : String(r.dstLabels ?? ''),
  }));
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nConnecting to FalkorDB graph: ${GRAPH_NAME}`);
  const db = await connect();
  const graph = db.selectGraph(GRAPH_NAME);

  // 1. Count total nodes first
  const countRows = await q(graph, 'MATCH (n) RETURN count(n) AS cnt');
  const totalNodes = Number(countRows[0]?.cnt ?? 0);
  console.log(`\nTotal nodes in graph: ${totalNodes}`);

  if (totalNodes === 0) {
    console.log('Graph is already empty. Nothing to dump.');
    await db.close?.();
    process.exit(0);
  }

  // 2. Dump
  console.log('\nDumping nodes...');
  const nodes = await dumpNodes(graph);

  console.log('\nDumping relationships...');
  const relationships = await dumpRelationships(graph);

  // 3. Save to file
  mkdirSync(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupPath = join(BACKUP_DIR, `debrief-${timestamp}.json`);

  const payload = {
    exportedAt: new Date().toISOString(),
    graphName: GRAPH_NAME,
    totalNodes,
    totalRelationships: relationships.length,
    nodes,
    relationships,
  };

  writeFileSync(backupPath, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\nBackup saved: ${backupPath}`);
  console.log(`  ${totalNodes} nodes, ${relationships.length} relationships`);

  // 4. Confirm and delete
  console.log(`\nDeleting all nodes from graph '${GRAPH_NAME}'...`);
  await graph.query('MATCH (n) DETACH DELETE n');
  console.log('Done. Graph is now empty.\n');

  // Verify
  const verifyRows = await q(graph, 'MATCH (n) RETURN count(n) AS cnt');
  const remaining = Number(verifyRows[0]?.cnt ?? 0);
  console.log(`Verification: ${remaining} nodes remaining in graph.`);

  await db.close?.();
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
