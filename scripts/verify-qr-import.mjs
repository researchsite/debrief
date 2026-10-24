import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { chromium, expect } from '@playwright/test';
import { FalkorDB } from 'falkordb';

const base = process.env.E2E_BASE_URL || 'http://localhost:3001';
const payload = 'https://www.linkedin.com/in/shamhc';
const output = resolve('_private/qr-import-verification');
mkdirSync(output, { recursive: true });
const { FALKORDB_URL } = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const db = await FalkorDB.connect({ url: FALKORDB_URL, socket: { connectTimeout: 10000, reconnectStrategy: false } });
const graph = db.selectGraph('debrief');
const q = async (cypher, params = {}) => (await graph.roQuery(cypher, { params })).data;
const browser = await chromium.launch();
try {
  const counts = async () => ({
    people: (await q('MATCH (p:Person) RETURN count(p) AS count'))[0].count,
    meetings: (await q('MATCH ()-[r:MET]->() RETURN count(r) AS count'))[0].count,
    notes: (await q('MATCH (n:Note) RETURN count(n) AS count'))[0].count,
    connections: (await q('MATCH (:Me)-[r:CONNECTED]->(:Person) RETURN count(r) AS count'))[0].count,
    agenda: (await q('MATCH (s:Session)-[:PART_OF]->(e:Event) WHERE e.url IS NOT NULL AND e.url <> "" RETURN count(s) AS count'))[0].count,
  });
  const before = await counts();
  const page = await browser.newPage({ viewport: { width: 430, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/import`);
  await page.locator('input[type=file]').first().setInputFiles(resolve('fixtures/qr/single.png'));
  const classified = page.waitForResponse(response => response.url().endsWith('/api/import/classify'), { timeout: 90000 });
  await page.getByRole('button', { name: /^Import/ }).click();
  const classificationResponse = await classified;
  assert.equal(classificationResponse.status(), 200);
  const classification = await classificationResponse.json();
  assert.equal(classification.items.filter(item => item.qr?.payload === payload).length, 1);
  const row = page.locator('[data-import-item]').filter({ hasText: payload });
  const saveButton = row.getByRole('button', { name: 'Add Person', exact: true });
  await expect(saveButton).toBeEnabled({ timeout: 30000 });
  const rowId = await row.getAttribute('data-import-item');
  const saved = page.waitForResponse(response => response.url().endsWith('/api/import/save'));
  await saveButton.click();
  const saveResponse = await saved;
  assert.equal(saveResponse.status(), 200);
  const savedBody = await saveResponse.json();
  assert.ok(savedBody.ok && savedBody.personId);
  const savedRow = page.locator(`[data-import-item="${rowId}"]`);
  await expect(savedRow.getByRole('link', { name: 'View contact →' })).toBeVisible();
  await page.screenshot({ path: `${output}/qr-saved.png`, fullPage: true });
  const qrId = createHash('sha256').update(`${classification._filePath}\0${payload}`).digest('hex');
  const provenance = await q('MATCH (a:Asset)-[:CONTAINS_QR]->(q:QrPayload {id:$id})-[:RESOLVES_TO]->(p:Person) RETURN a.file_path AS image, q.payload AS payload, p.id AS personId', { id: qrId });
  assert.deepEqual(provenance, [{ image: classification._filePath, payload, personId: savedBody.personId }]);
  const retry = await page.request.post(`${base}/api/import/save`, { data: saveResponse.request().postDataJSON() });
  assert.equal(retry.status(), 200);
  assert.equal((await q('MATCH (q:QrPayload {id:$id}) RETURN count(q) AS count', { id: qrId }))[0].count, 1);
  assert.deepEqual(await counts(), before, 'QR contact saving must preserve people, meetings, notes, network, and agenda counts.');
  await savedRow.getByRole('link', { name: 'View contact →' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sham Sundar Hassan Chikkegowda');
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ status: 'PASS', verifiedAt: new Date().toISOString(), flow: 'real browser upload → local QR decoder → existing profile resolution → contact save → provenance → profile', qrCount: 1, provenance, preservedCounts: before, classificationWarning: classification.warning ?? null, browserErrors: errors }, null, 2) + '\n');
  console.log('PASS real QR import: image decoded, existing contact resolved, reviewed and saved through the browser.');
  console.log('PASS provenance and retry: image → decoded payload → existing person, one QR record after retry.');
  console.log(`PASS contact-only save: no new meeting, note, or person; ${before.connections} connections and ${before.agenda} agenda entries preserved.`);
  console.log('PASS saved contact profile: opens correctly, no browser runtime errors.');
} finally {
  await browser.close();
  await db.close();
}
