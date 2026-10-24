// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { query, getGraph } from '../lib/graph';
import { upsertContactProfile, captureMeeting } from '../lib/person-profile';
import { saveQrProvenance } from '../lib/qr-save';

const graphName = `debrief_qr_test_${Date.now()}`;
const enabled = process.env.RUN_LIVE_GRAPH_TESTS === 'true';
afterAll(async () => { if (enabled) await (await getGraph(graphName)).delete(); });
describe.skipIf(!enabled)('isolated live QR graph and meeting writes', () => {
  it('preserves each QR and creates exactly one meeting and note on retry', async () => {
    await query('CREATE (:Me {linkedin_url:"test-owner"})', {}, graphName);
    const id = await upsertContactProfile({ id: 'contact:qr-test', name: 'QR Test Contact', linkedin_url: '', headline: 'Engineer', city: '', current_company: 'Tools', past_companies: [], schools: [], skills: [], email: 'qr-test@example.com' }, graphName);
    await saveQrProvenance('/uploads/test-image.png', { id: 'first', payload: 'first QR' }, { kind: 'business_card', name: 'QR Test Contact', company: 'Tools', title: 'Engineer', email: '', linkedin_url: '' }, id, graphName);
    await saveQrProvenance('/uploads/test-image.png', { id: 'second', payload: 'second QR' }, { kind: 'qr', text: 'second QR' }, undefined, graphName);
    await saveQrProvenance('/uploads/test-image.png', { id: 'second', payload: 'second QR' }, { kind: 'qr', text: 'second QR' }, undefined, graphName);
    expect((await query('MATCH ()-[r:MET]->() RETURN count(r) AS count', {}, graphName)).data?.[0].count).toBe(0);
    expect((await query('MATCH (:Asset {file_path:"/uploads/test-image.png"})-[:CONTAINS_QR]->(q:QrPayload) RETURN count(q) AS count', {}, graphName)).data?.[0].count).toBe(2);
    const path = await query('MATCH p=(:Asset)-[:CONTAINS_QR]->(:QrPayload)-[:RESOLVES_TO]->(:Person) RETURN p', {}, graphName);
    expect(path.data?.length).toBe(1);
    await captureMeeting(id, 'same-request', 'Original conversation note', graphName);
    await captureMeeting(id, 'same-request', 'Original conversation note', graphName);
    expect((await query('MATCH ()-[r:MET]->() RETURN count(r) AS count', {}, graphName)).data?.[0].count).toBe(1);
    expect((await query('MATCH (n:Note) RETURN count(n) AS count', {}, graphName)).data?.[0].count).toBe(1);
  }, 30000);
});
