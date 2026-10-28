/**
 * Restores the debrief graph from a backup JSON file.
 * Run: node scripts/restore-graph.mjs _private/db-backup/debrief-XXXX.json
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
  const envPath = join(ROOT, '.env.local');
  if (!existsSync(envPath)) { console.error('ERROR: .env.local not found'); process.exit(1); }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('='); if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadEnv();

const backupFile = process.argv[2];
if (!backupFile) { console.error('Usage: node scripts/restore-graph.mjs <backup.json>'); process.exit(1); }
const backupPath = resolve(backupFile);
if (!existsSync(backupPath)) { console.error('Backup file not found:', backupPath); process.exit(1); }

const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
console.log(`\nRestoring from: ${backupPath}`);
console.log(`Exported at: ${backup.exportedAt}`);
console.log(`Nodes: ${backup.totalNodes}, Relationships: ${backup.totalRelationships}\n`);

// ── Unique key per label ───────────────────────────────────────────────────
// Used to MERGE nodes and to look them up when recreating relationships.
const UNIQUE_KEY = {
  Me:              'linkedin_url',
  Event:           'name',
  Person:          'linkedin_url',
  Company:         'name',
  Session:         'title',
  Idea:            'text',
  Topic:           'name',
  Skill:           'name',
  School:          'name',
  Note:            '_created_composite', // special: created_at+text
  Context:         '_person_ctx',        // special: linked via person
  Source:          'url',
  Coupon:          'code',
  Asset:           'file_path',
  Transcript:      'filename',
  Conversation:    '_conv_composite',    // special: starts+ends
  FollowUp:        'draft_for',
  Role:            'title',
  Intent:          'name',
  Project:         'url',
  ProjectAnalysis: 'source_url',
};

// For labels where the unique key is a real property:
function nodeKey(label, props) {
  const k = UNIQUE_KEY[label];
  if (!k || k.startsWith('_')) return null;
  return props[k] != null ? String(props[k]) : null;
}

async function connect() {
  const url = process.env.FALKORDB_URL;
  if (url) return FalkorDB.connect({ url });
  return FalkorDB.connect({
    socket: {
      host: process.env.FALKORDB_HOST ?? 'localhost',
      port: parseInt(process.env.FALKORDB_PORT ?? '6379', 10),
      tls: process.env.FALKORDB_SSL === 'true',
    },
    ...(process.env.FALKORDB_USERNAME && { username: process.env.FALKORDB_USERNAME }),
    ...(process.env.FALKORDB_PASSWORD && { password: process.env.FALKORDB_PASSWORD }),
  });
}

function propsWithout(props, ...exclude) {
  return Object.fromEntries(Object.entries(props).filter(([k]) => !exclude.includes(k)));
}

async function main() {
  const db = await connect();
  const g = db.selectGraph('debrief');

  // Verify empty
  const countRes = await g.query('MATCH (n) RETURN count(n) AS cnt');
  const existing = Number(countRes.data?.[0]?.cnt ?? 0);
  if (existing > 0) {
    console.warn(`WARNING: graph already has ${existing} nodes. Continuing with MERGE (safe).`);
  }

  const { nodes, relationships } = backup;

  // ── Map old node ID -> { label, uniqueProp, uniqueVal } ─────────────────
  // Used to resolve relationship endpoints.
  const oldIdToKey = new Map(); // oldId -> { label, key, val }

  // ── Phase 1: Create all nodes ────────────────────────────────────────────
  for (const [label, nodeList] of Object.entries(nodes)) {
    if (!nodeList || nodeList.length === 0) continue;
    const ukProp = UNIQUE_KEY[label];
    let created = 0;

    for (const node of nodeList) {
      const { _id, ...props } = node;
      const cleanProps = Object.fromEntries(
        Object.entries(props).filter(([, v]) => v !== null && v !== undefined)
      );

      try {
        if (!ukProp || ukProp.startsWith('_')) {
          // No simple unique key — use CREATE (Note, Context, Conversation)
          const setParts = Object.keys(cleanProps).map(k => `n.${k} = $${k}`).join(', ');
          const cypher = setParts
            ? `CREATE (n:${label}) SET ${setParts} RETURN id(n) AS newId`
            : `CREATE (n:${label}) RETURN id(n) AS newId`;
          const res = await g.query(cypher, { params: cleanProps });
          const newId = String(res.data?.[0]?.newId ?? '');
          if (_id) oldIdToKey.set(String(_id), { label, newId, props: cleanProps });
        } else {
          const ukVal = cleanProps[ukProp];
          if (ukVal == null) {
            // No unique key value — CREATE
            const setParts = Object.keys(cleanProps).map(k => `n.${k} = $${k}`).join(', ');
            const cypher = setParts
              ? `CREATE (n:${label}) SET ${setParts} RETURN id(n) AS newId`
              : `CREATE (n:${label}) RETURN id(n) AS newId`;
            const res = await g.query(cypher, { params: cleanProps });
            const newId = String(res.data?.[0]?.newId ?? '');
            if (_id) oldIdToKey.set(String(_id), { label, newId, props: cleanProps });
          } else {
            const setProps = propsWithout(cleanProps, ukProp);
            const setParts = Object.keys(setProps).map(k => `n.${k} = $${k}`).join(', ');
            const cypher = setParts
              ? `MERGE (n:${label} {${ukProp}: $${ukProp}}) SET ${setParts} RETURN id(n) AS newId`
              : `MERGE (n:${label} {${ukProp}: $${ukProp}}) RETURN id(n) AS newId`;
            const res = await g.query(cypher, { params: cleanProps });
            const newId = String(res.data?.[0]?.newId ?? '');
            if (_id) oldIdToKey.set(String(_id), { label, ukProp, ukVal: String(ukVal), newId, props: cleanProps });
          }
        }
        created++;
      } catch (err) {
        console.warn(`  WARN: failed to create ${label} node:`, err.message, JSON.stringify(cleanProps).slice(0, 100));
      }
    }
    console.log(`  ${label}: ${created} / ${nodeList.length} nodes created`);
  }

  // ── Phase 2: Create relationships ────────────────────────────────────────
  console.log('\nCreating relationships...');
  let relCreated = 0, relFailed = 0;

  for (const rel of relationships) {
    const srcInfo = oldIdToKey.get(String(rel.src));
    const dstInfo = oldIdToKey.get(String(rel.dst));

    if (!srcInfo || !dstInfo) { relFailed++; continue; }

    try {
      // Build MATCH clauses — prefer ukProp match, fall back to internal newId
      let srcMatch, dstMatch, params = {};

      if (srcInfo.ukProp) {
        srcMatch = `MATCH (a:${srcInfo.label} {${srcInfo.ukProp}: $srcVal})`;
        params.srcVal = srcInfo.ukVal;
      } else {
        srcMatch = `MATCH (a:${srcInfo.label}) WHERE id(a) = ${srcInfo.newId}`;
      }

      if (dstInfo.ukProp) {
        dstMatch = `MATCH (b:${dstInfo.label} {${dstInfo.ukProp}: $dstVal})`;
        params.dstVal = dstInfo.ukVal;
      } else {
        dstMatch = `MATCH (b:${dstInfo.label}) WHERE id(b) = ${dstInfo.newId}`;
      }

      const relPropsKeys = Object.keys(rel.relProps ?? {}).filter(k => rel.relProps[k] != null);
      const relParamStr = relPropsKeys.map(k => `${k}: $rp_${k}`).join(', ');
      for (const k of relPropsKeys) params[`rp_${k}`] = rel.relProps[k];

      const relStr = relParamStr ? `[r:${rel.rel} {${relParamStr}}]` : `[r:${rel.rel}]`;
      const cypher = `${srcMatch} ${dstMatch} MERGE (a)-${relStr}->(b)`;

      await g.query(cypher, { params });
      relCreated++;
    } catch (err) {
      relFailed++;
      if (relFailed <= 5) console.warn(`  WARN rel ${rel.rel}:`, err.message?.slice(0, 80));
    }
  }

  console.log(`  Relationships: ${relCreated} created, ${relFailed} failed`);

  // ── Verify ────────────────────────────────────────────────────────────────
  const verRes = await g.query('MATCH (n) RETURN count(n) AS cnt');
  console.log(`\nFinal node count: ${verRes.data?.[0]?.cnt ?? 0}`);

  await db.close?.();
  console.log('Restore complete.\n');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
