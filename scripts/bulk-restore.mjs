/**
 * Bulk-restore the debrief graph using UNWIND batches (much faster + fewer round-trips).
 * Run: node scripts/bulk-restore.mjs _private/db-backup/debrief-XXXX.json
 */
import { createRequire } from 'module';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { FalkorDB } = require('falkordb');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function loadEnv() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) { console.error('.env.local not found'); process.exit(1); }
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const eq = line.indexOf('='); if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv();

const backupFile = process.argv[2];
if (!backupFile) { console.error('Usage: node scripts/bulk-restore.mjs <backup.json>'); process.exit(1); }
const backupPath = resolve(backupFile);
if (!existsSync(backupPath)) { console.error('Backup file not found:', backupPath); process.exit(1); }

const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
console.log(`\nRestoring: ${backup.exportedAt}  |  ${backup.totalNodes} nodes, ${backup.totalRelationships} rels\n`);

async function freshConn() {
  const url = process.env.FALKORDB_URL;
  const db = url
    ? await FalkorDB.connect({ url })
    : await FalkorDB.connect({
        socket: {
          host: process.env.FALKORDB_HOST ?? 'localhost',
          port: parseInt(process.env.FALKORDB_PORT ?? '6379', 10),
          tls: process.env.FALKORDB_SSL === 'true',
        },
        ...(process.env.FALKORDB_USERNAME && { username: process.env.FALKORDB_USERNAME }),
        ...(process.env.FALKORDB_PASSWORD && { password: process.env.FALKORDB_PASSWORD }),
      });
  return db;
}

// Unique key for each label (used in MERGE)
const UNIQUE_KEY = {
  Me: 'linkedin_url', Event: 'name', Person: 'linkedin_url',
  Company: 'name', Session: 'title', Idea: 'text', Topic: 'name',
  Skill: 'name', School: 'name', Source: 'url', Coupon: 'code',
  Asset: 'file_path', Transcript: 'filename', Role: 'title',
  Intent: 'name', Project: 'url', ProjectAnalysis: 'source_url',
  // No stable unique key — will CREATE:
  Note: null, Context: null, Conversation: null, FollowUp: null,
};

// BATCH_SIZE for UNWIND queries
const BATCH = 200;

async function bulkMergeNodes(g, label, ukProp, nodes) {
  if (!nodes.length) return;
  const chunks = [];
  for (let i = 0; i < nodes.length; i += BATCH) chunks.push(nodes.slice(i, i + BATCH));

  for (const chunk of chunks) {
    // Build a property map per node (exclude _id)
    const rows = chunk.map(({ _id, ...props }) => {
      const clean = {};
      for (const [k, v] of Object.entries(props)) {
        if (v !== null && v !== undefined) clean[k] = v;
      }
      return clean;
    });

    try {
      if (ukProp) {
        // MERGE on unique key, SET everything else
        const setCols = [...new Set(rows.flatMap(r => Object.keys(r)).filter(k => k !== ukProp))]
          .map(k => `n.${k} = row.${k}`).join(', ');
        const cypher = setCols
          ? `UNWIND $rows AS row MERGE (n:${label} {${ukProp}: row.${ukProp}}) SET ${setCols}`
          : `UNWIND $rows AS row MERGE (n:${label} {${ukProp}: row.${ukProp}})`;
        await g.query(cypher, { params: { rows } });
      } else {
        // CREATE (no unique key)
        const setCols = [...new Set(rows.flatMap(r => Object.keys(r)))]
          .map(k => `n.${k} = row.${k}`).join(', ');
        const cypher = setCols
          ? `UNWIND $rows AS row CREATE (n:${label}) SET ${setCols}`
          : `UNWIND $rows AS row CREATE (n:${label})`;
        await g.query(cypher, { params: { rows } });
      }
    } catch (err) {
      console.warn(`  WARN bulk ${label}:`, err.message?.slice(0, 120));
      // Fall back to one-by-one for this chunk
      for (const row of rows) {
        try {
          if (ukProp && row[ukProp] != null) {
            const setStr = Object.keys(row).filter(k => k !== ukProp).map(k => `n.${k} = $${k}`).join(', ');
            const cypher = setStr
              ? `MERGE (n:${label} {${ukProp}: $${ukProp}}) SET ${setStr}`
              : `MERGE (n:${label} {${ukProp}: $${ukProp}})`;
            await g.query(cypher, { params: row });
          } else {
            const setStr = Object.keys(row).map(k => `n.${k} = $${k}`).join(', ');
            const cypher = setStr ? `CREATE (n:${label}) SET ${setStr}` : `CREATE (n:${label})`;
            await g.query(cypher, { params: row });
          }
        } catch { /* skip */ }
      }
    }
  }
}

// Build old-id -> { label, ukProp, ukVal } map for relationship resolution
function buildIdMap(nodes) {
  const map = new Map();
  for (const [label, nodeList] of Object.entries(nodes)) {
    const ukProp = UNIQUE_KEY[label];
    for (const node of (nodeList ?? [])) {
      const { _id, ...props } = node;
      if (!_id) continue;
      const ukVal = ukProp ? props[ukProp] : null;
      map.set(String(_id), { label, ukProp: ukProp ?? null, ukVal: ukVal != null ? String(ukVal) : null, props });
    }
  }
  return map;
}

async function restoreRelationships(g, relationships, idMap) {
  let ok = 0, fail = 0;
  const chunks = [];
  for (let i = 0; i < relationships.length; i += BATCH) chunks.push(relationships.slice(i, i + BATCH));

  for (const chunk of chunks) {
    // Group by (srcLabel+ukProp, dstLabel+ukProp, relType) for bulk UNWIND
    const grouped = new Map();
    for (const rel of chunk) {
      const src = idMap.get(String(rel.src));
      const dst = idMap.get(String(rel.dst));
      if (!src || !dst) { fail++; continue; }
      if (!src.ukProp || src.ukVal == null || !dst.ukProp || dst.ukVal == null) {
        // Can't bulk-merge without unique key — skip (rare)
        fail++; continue;
      }
      const key = `${src.label}|${src.ukProp}|${dst.label}|${dst.ukProp}|${rel.rel}`;
      if (!grouped.has(key)) grouped.set(key, { src, dst, relType: rel.rel, pairs: [] });
      grouped.get(key).pairs.push({ sv: src.ukVal, dv: dst.ukVal, rp: rel.relProps ?? {} });
    }

    for (const { src, dst, relType, pairs } of grouped.values()) {
      try {
        const cypher = `
          UNWIND $pairs AS p
          MATCH (a:${src.label} {${src.ukProp}: p.sv})
          MATCH (b:${dst.label} {${dst.ukProp}: p.dv})
          MERGE (a)-[r:${relType}]->(b)
          SET r += p.rp`;
        await g.query(cypher, { params: { pairs } });
        ok += pairs.length;
      } catch (err) {
        fail += pairs.length;
        if (fail <= 20) console.warn(`  WARN rel ${relType}:`, err.message?.slice(0, 80));
      }
    }
  }
  return { ok, fail };
}

async function countNodes(g) {
  const r = await g.query('MATCH (n) RETURN count(n) AS cnt');
  return Number(r.data?.[0]?.cnt ?? 0);
}

async function main() {
  // ── Phase 0: clear existing partial data ──────────────────────────────
  console.log('Clearing existing data...');
  let db = await freshConn();
  let g = db.selectGraph('debrief');
  await g.query('MATCH (n) DETACH DELETE n');
  let count = await countNodes(g);
  console.log(`  After clear: ${count} nodes`);
  await db.close();

  // ── Phase 1: restore nodes ─────────────────────────────────────────────
  console.log('\nRestoring nodes...');
  db = await freshConn();
  g = db.selectGraph('debrief');

  for (const [label, nodeList] of Object.entries(backup.nodes)) {
    if (!nodeList?.length) continue;
    const ukProp = UNIQUE_KEY[label] ?? null;
    await bulkMergeNodes(g, label, ukProp, nodeList);
    console.log(`  ${label}: ${nodeList.length}`);
  }

  count = await countNodes(g);
  console.log(`\nNodes after restore: ${count}`);
  await db.close();

  // ── Phase 2: restore relationships ────────────────────────────────────
  console.log('\nRestoring relationships...');
  db = await freshConn();
  g = db.selectGraph('debrief');

  const idMap = buildIdMap(backup.nodes);
  const { ok, fail } = await restoreRelationships(g, backup.relationships, idMap);
  console.log(`  ${ok} created, ${fail} skipped`);

  // ── Verify ────────────────────────────────────────────────────────────
  const finalCount = await countNodes(g);
  const relRes = await g.query('MATCH ()-[r]->() RETURN count(r) AS cnt');
  const relCount = Number(relRes.data?.[0]?.cnt ?? 0);

  const meRes = await g.query('MATCH (me:Me) RETURN me.linkedin_url AS url, me.name AS name');
  const evRes = await g.query('MATCH (me:Me)-[:ATTENDED]->(e:Event) RETURN e.name AS ev');
  const sessRes = await g.query('MATCH (s:Session) RETURN count(s) AS cnt');
  const projRes = await g.query('MATCH (p:Project) RETURN count(p) AS cnt');

  console.log(`\nFinal: ${finalCount} nodes, ${relCount} relationships`);
  console.log('Me:', JSON.stringify(meRes.data?.[0]));
  console.log('Events attended:', evRes.data?.map(r => r.ev));
  console.log('Sessions:', sessRes.data?.[0]?.cnt);
  console.log('Projects:', projRes.data?.[0]?.cnt);

  await db.close();
  console.log('\nDone.\n');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
