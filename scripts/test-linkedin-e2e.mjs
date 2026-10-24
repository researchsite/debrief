import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { FalkorDB } from 'falkordb';

// Usage: node scripts/test-linkedin-e2e.mjs /path/to/export.zip https://www.linkedin.com/in/you
// Requires the app running on localhost:3001. Imports into its real debrief graph.
const [archivePath, ownerUrl] = process.argv.slice(2);
assert.ok(archivePath && ownerUrl, 'Pass the LinkedIn ZIP path and your profile URL.');
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3001';
const { FALKORDB_URL } = parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8'));
assert.ok(FALKORDB_URL, 'FALKORDB_URL must be configured in .env');
const zip = await JSZip.loadAsync(readFileSync(archivePath));
async function csv(name, header) {
  const entry = Object.values(zip.files).find((f) => !f.dir && f.name.split('/').pop().toLowerCase() === name.toLowerCase());
  assert.ok(entry, `Missing ${name}`);
  const text = await entry.async('string');
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const start = lines.findIndex((line) => Papa.parse(line).data[0]?.[0] === header);
  assert.ok(start >= 0, `Missing ${name} header`);
  const parsed = Papa.parse(lines.slice(start).join('\n'), { header: true, skipEmptyLines: true, delimiter: ',' });
  assert.equal(parsed.errors.length, 0, `Invalid ${name}: ${JSON.stringify(parsed.errors)}`);
  return { rows: parsed.data, text };
}
const profile = await csv('Profile.csv', 'First Name');
const positions = await csv('Positions.csv', 'Company Name');
const education = await csv('Education.csv', 'School Name');
const skills = await csv('Skills.csv', 'Name');
const connections = await csv('Connections.csv', 'First Name');
const valid = connections.rows.filter((r) => r.URL?.trim());
const expectedConnections = new Set(valid.map((r) => r.URL.trim())).size;
const expectedSkills = new Set(skills.rows.filter((r) => r.Name).map((r) => r.Name.toLowerCase())).size;
const ownerName = `${profile.rows[0]['First Name']} ${profile.rows[0]['Last Name']}`.trim();
const report = { checks: [], archive: { connectionRows: connections.rows.length, validRows: valid.length, uniqueConnections: expectedConnections, skippedRows: connections.rows.length - valid.length } };
function pass(check, detail) {
  report.checks.push({ check, status: 'PASS', detail });
  console.log(`PASS ${check}: ${detail}`);
}
const outputDir = resolve('_private/linkedin-e2e');
mkdirSync(outputDir, { recursive: true });
let browser;
let db;
try {
  db = await FalkorDB.connect({ url: FALKORDB_URL, socket: { connectTimeout: 10000, reconnectStrategy: false } });
  db.on('error', () => console.error('Database connection error (credentials omitted).'));
  const graph = db.selectGraph('debrief');
  const q = async (query, params = {}) => (await graph.query(query, { params })).data;
  const owners = await q('MATCH (me:Me) RETURN me.linkedin_url AS url');
  assert.ok(owners.every((r) => r.url === ownerUrl), 'Another owner exists; refusing to attach connections to multiple people.');
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${baseURL}/setup`);
  await page.getByLabel('Name', { exact: false }).first().fill(ownerName);
  await page.locator('#linkedin-url').fill(ownerUrl);
  await page.getByRole('checkbox', { name: /General Networking/ }).click();
  const setupResponse = page.waitForResponse((r) => r.url().endsWith('/api/setup'), { timeout: 60000 });
  await page.getByRole('button', { name: 'Save & Start' }).click();
  const setup = await setupResponse;
  assert.equal(setup.status(), 200, `Setup failed: ${(await setup.text()).slice(0,300)}`);
  await page.waitForURL('**/today');
  const cloudOwner = await q('MATCH (me:Me {linkedin_url:$url}) RETURN me.name AS name', { url: ownerUrl });
  assert.equal(cloudOwner[0]?.name, ownerName, 'Browser setup did not reach the configured cloud graph');
  pass('Browser setup → cloud', 'Owner and networking intent saved through the real UI.');

  await page.goto(`${baseURL}/setup`);
  await page.locator('#linkedin-url').fill(ownerUrl);
  const archiveSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Import your LinkedIn archive', exact: true }) });
  const connectionsSection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Import your connections', exact: true }) });
  await archiveSection.locator('input[type=file]').first().setInputFiles(resolve(archivePath));
  await connectionsSection.locator('input[type=file]').setInputFiles({ name: 'Connections.csv', mimeType: 'text/csv', buffer: Buffer.from(connections.text) });

  async function importArchive() {
    const responsePromise = page.waitForResponse((r) => r.url().endsWith('/api/import/profile'), { timeout: 120000 });
    await archiveSection.getByRole('button', { name: 'Import', exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 200, `Profile import failed: ${(await response.text()).slice(0,300)}`);
    const body = await response.json();
    assert.equal(body.companies, positions.rows.filter((r) => r['Company Name']).length);
    assert.equal(body.schools, education.rows.filter((r) => r['School Name']).length);
    assert.equal(body.skills, skills.rows.filter((r) => r.Name).length);
    await expect(archiveSection.getByText(/Imported \d+ companies/)).toBeVisible();
    return body;
  }
  async function importConnections() {
    await connectionsSection.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(connectionsSection.getByText(`Imported ${valid.length} connections`, { exact: true })).toBeVisible({ timeout: 120000 });
  }
  const importedProfile = await importArchive();
  pass('ZIP profile import', `${importedProfile.companies} positions, ${importedProfile.schools} schools, ${importedProfile.skills} skills acknowledged by UI/API.`);
  await importConnections();
  pass('Connections import', `${valid.length} valid rows processed in browser batches; ${report.archive.skippedRows} rows without URLs skipped.`);

  const owner = (await q('MATCH (me:Me {linkedin_url:$url}) RETURN me.headline AS headline', { url: ownerUrl }))[0];
  assert.equal(owner.headline, profile.rows[0].Headline);
  const connected = await q('MATCH (:Me {linkedin_url:$url})-[r:CONNECTED]->(p:Person) RETURN count(r) AS edges, count(DISTINCT p) AS people', { url: ownerUrl });
  assert.equal(connected[0].people, expectedConnections);
  assert.equal(connected[0].edges, expectedConnections);
  const dbSkills = await q('MATCH (:Me {linkedin_url:$url})-[:HAS_SKILL]->(s:Skill) RETURN count(DISTINCT s) AS count', { url: ownerUrl });
  assert.equal(dbSkills[0].count, expectedSkills);
  for (const position of positions.rows.filter((r) => r['Company Name'])) {
    const params = { url: ownerUrl, company: position['Company Name'], title: position.Title ?? '', started: position['Started On'] ?? '', ended: position['Finished On'] ?? '' };
    const result = params.ended
      ? await q('MATCH (:Me {linkedin_url:$url})-[r:WORKED_AT {title:$title, started:$started, ended:$ended}]->(:Company {name:$company}) RETURN count(r) AS count', params)
      : await q('MATCH (:Me {linkedin_url:$url})-[r:WORKS_AT]->(:Company {name:$company}) RETURN count(r) AS count', params);
    assert.equal(result[0].count, 1, 'An exported position is missing or duplicated');
  }
  for (const school of education.rows.filter((r) => r['School Name'])) {
    const result = await q('MATCH (:Me {linkedin_url:$url})-[r:STUDIED_AT {degree:$degree, started:$started, ended:$ended}]->(:School {name:$name}) RETURN count(r) AS count', {
      url: ownerUrl, name: school['School Name'], degree: school['Degree Name'] ?? '', started: school['Start Date'] ?? '', ended: school['End Date'] ?? '',
    });
    assert.equal(result[0].count, 1, 'An exported school is missing or duplicated');
  }
  // Check each exported connection and its company, independently of API totals.
  const rows = valid.map((r) => ({ url: r.URL.trim(), name: `${r['First Name'] ?? ''} ${r['Last Name'] ?? ''}`, company: r.Company?.trim() ?? '' }));
  const matching = await q(`UNWIND $rows AS row MATCH (:Me {linkedin_url:$url})-[:CONNECTED]->(p:Person {linkedin_url:row.url}) WHERE p.name = row.name RETURN count(DISTINCT p) AS count`, { rows, url: ownerUrl });
  assert.equal(matching[0].count, expectedConnections);
  const companyRows = rows.filter((r) => r.company);
  const companies = await q(`UNWIND $rows AS row MATCH (p:Person {linkedin_url:row.url})-[r:WORKS_AT]->(:Company {name:row.company}) RETURN count(r) AS count`, { rows: companyRows });
  assert.equal(companies[0].count, companyRows.length);
  pass('Source reconciliation', `${expectedConnections} unique connections and ${expectedSkills} skills verified; connections, companies, positions, and education match the CSVs.`);

  async function snapshot() {
    return {
      nodes: (await q('MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY label')),
      edges: (await q('MATCH ()-[r]->() RETURN type(r) AS type, count(r) AS count ORDER BY type')),
    };
  }
  const before = await snapshot();
  await importArchive();
  await importConnections();
  assert.deepEqual(await snapshot(), before);
  report.graph = before;
  pass('Repeat import', 'Reimported profile and connections; node and edge counts unchanged.');

  const paths = await q(`MATCH p=(:Me {linkedin_url:$url})-[:CONNECTED]->(person:Person)-[:WORKS_AT]->(company:Company) RETURN p, person.name AS name, person.linkedin_url AS url, company.name AS company ORDER BY name LIMIT 1`, { url: ownerUrl });
  assert.ok(paths.length > 0);
  assert.equal(paths[0].p.edges.length, 2);
  pass('Real multi-hop query', 'Returned a 2-hop Me → CONNECTED → Person → WORKS_AT → Company path.');
  const example = paths[0];
  const whyResponse = await page.request.get(`${baseURL}/api/why?name=${encodeURIComponent(example.name)}`);
  assert.equal(whyResponse.status(), 200);
  const why = await whyResponse.json();
  assert.ok(why.path.nodes.length >= 3);
  assert.ok(why.path.links.some((link) => link.label === 'CONNECTED'));
  assert.ok(why.path.links.some((link) => link.label === 'WORKS_AT'));
  await page.goto(`${baseURL}/why?name=${encodeURIComponent(example.name)}`);
  await expect(page.getByRole('heading', { name: `Why ${example.name}`, exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toBeVisible();
  await page.screenshot({ path: `${outputDir}/relationship-path.png`, fullPage: true });
  pass('Relationship UI', 'Why API returns real links and browser renders the graph canvas.');
  const encoded = encodeURIComponent(Buffer.from(example.url).toString('base64'));
  await page.goto(`${baseURL}/person/${encoded}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(example.name, { timeout: 30000 });
  await expect(page.locator('main')).toContainText(example.company);
  await page.screenshot({ path: `${outputDir}/person.png`, fullPage: true });
  await page.goto(`${baseURL}/today`);
  await expect(page.locator('main')).toContainText('Patch the Conference Hackathon');
  await page.screenshot({ path: `${outputDir}/today.png`, fullPage: true });
  assert.deepEqual(errors, [], 'Browser runtime errors occurred');
  pass('Person and Today UI', 'Real contact details and event render; no browser runtime errors.');
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  // Keep exported personal data and connection credentials out of failure logs.
  console.error('FAIL LinkedIn end-to-end run:', String(error.message).replace(/falkors?:\/\/[^\s]+/g, '[REDACTED_URL]'));
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  writeFileSync(`${outputDir}/report.json`, JSON.stringify(report, null, 2) + '\n');
  if (browser) await browser.close();
  if (db) await db.close();
}
