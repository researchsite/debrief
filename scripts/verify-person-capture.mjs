import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { FalkorDB } from 'falkordb';

const [linkedinUrl, note] = process.argv.slice(2);
assert.ok(linkedinUrl && note, 'Pass a LinkedIn profile URL and the conversation note.');
const base = process.env.E2E_BASE_URL || 'http://localhost:3001';
const requestId = `live-verification:${createHash('sha256').update(linkedinUrl + '\0' + note).digest('hex')}`;
const { FALKORDB_URL } = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
const output = resolve('_private/person-capture-verification');
mkdirSync(output, { recursive: true });
const db = await FalkorDB.connect({ url: FALKORDB_URL, socket: { connectTimeout: 10000, reconnectStrategy: false } });
const graph = db.selectGraph('debrief');
const q = async (cypher, params = {}) => (await graph.roQuery(cypher, { params })).data;
const browser = await chromium.launch();
try {
  const counts = async () => ({
    connections: (await q('MATCH (:Me)-[r:CONNECTED]->(:Person) RETURN count(r) AS count'))[0].count,
    agenda: (await q('MATCH (s:Session)-[:PART_OF]->(e:Event) WHERE e.url IS NOT NULL AND e.url <> "" RETURN count(s) AS count'))[0].count,
  });
  const before = await counts();
  const page = await browser.newPage({ viewport: { width: 430, height: 950 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Verify that looking up QR contact details is read-only.
  const beforePreview = await q('MATCH ()-[r:MET]->() RETURN count(r) AS count');
  const preview = await page.request.post(`${base}/api/import/resolve-qr`, { data: { payload: linkedinUrl } });
  assert.equal(preview.status(), 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.item.result.kind, 'business_card');
  assert.ok(!previewBody.item.error, 'Existing graph profile should resolve without an external request.');
  assert.deepEqual(await q('MATCH ()-[r:MET]->() RETURN count(r) AS count'), beforePreview);
  console.log('PASS QR contact preview: existing profile resolved without creating a meeting.');

  await page.route('**/api/person', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const data = route.request().postDataJSON();
    await route.continue({ postData: JSON.stringify({ ...data, requestId }) });
  });
  await page.goto(`${base}/add-person`);
  await page.locator('#linkedin-url').fill(linkedinUrl);
  await page.locator('#note').fill(note);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/person') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add Person', exact: true }).click();
  const response = await responsePromise;
  assert.equal(response.status(), 200);
  const data = await response.json();
  assert.ok(data.ok && data.person?.id, 'Meeting must return a saved person.');
  await expect(page.getByRole('heading', { name: 'Person Added', exact: true })).toBeVisible();
  await page.screenshot({ path: `${output}/person-added.png`, fullPage: true });
  await page.getByRole('link', { name: 'View full profile →' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(data.person.name);
  await expect(page.locator('main').getByText(note, { exact: true }).filter({ visible: true })).toHaveCount(1);
  await page.screenshot({ path: `${output}/person-note.png`, fullPage: true });
  console.log('PASS Add Person: imported details used, exact conversation note saved and displayed.');

  const retry = await page.request.post(`${base}/api/person`, { data: { linkedinUrl, note, requestId, isHiring: false } });
  assert.equal(retry.status(), 200);
  const captureId = `${data.person.id}:${requestId}`;
  const notes = await q('MATCH (n:Note {capture_id:$id}) RETURN count(n) AS count, collect(n.text) AS texts', { id: captureId });
  const meetings = await q('MATCH ()-[r:MET {capture_id:$id}]->() RETURN count(r) AS count', { id: captureId });
  assert.equal(notes[0].count, 1); assert.deepEqual(notes[0].texts, [note]); assert.equal(meetings[0].count, 1);
  console.log('PASS repeated submission: exactly one meeting and one note.');
  await page.goto(`${base}/today`);
  await expect(page.locator('main').getByText(data.person.name, { exact: true }).filter({ visible: true })).toHaveCount(1);
  await page.screenshot({ path: `${output}/today.png`, fullPage: true });
  assert.deepEqual(await counts(), before);
  assert.deepEqual(pageErrors, []);
  writeFileSync(`${output}/report.json`, JSON.stringify({ status: 'PASS', verifiedAt: new Date().toISOString(), connections: before.connections, agendaEntries: before.agenda, meetingCount: 1, noteCount: 1, profile: data.person.name, warnings: data.warnings ?? [] }, null, 2) + '\n');
  console.log(`PASS Today and existing data: ${before.connections} connections and ${before.agenda} agenda entries preserved; no browser runtime errors.`);
} finally {
  await browser.close();
  await db.close();
}
