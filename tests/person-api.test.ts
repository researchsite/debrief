// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), upsert: vi.fn(), capture: vi.fn(), common: vi.fn(), query: vi.fn() }));
vi.mock('../lib/person-profile', async (original) => ({ ...await original<typeof import('../lib/person-profile')>(), resolvePersonProfile: mocks.resolve, upsertContactProfile: mocks.upsert, captureMeeting: mocks.capture }));
vi.mock('../lib/graph-writes', () => ({ getCommonGround: mocks.common }));
vi.mock('../lib/graph', () => ({ query: mocks.query, roQuery: vi.fn() }));
vi.mock('next/server', async (original) => ({ ...await original<typeof import('next/server')>(), after: vi.fn() }));
const profile = { linkedin_url: 'https://www.linkedin.com/in/shamhc', name: 'Test Contact', headline: 'Engineer', city: 'SF', current_company: 'Tools', past_companies: [], schools: [], skills: [] };
const body = { linkedinUrl: profile.linkedin_url, note: 'about the event and builder tools', isHiring: false, requestId: 'test-submission' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolve.mockReset().mockResolvedValue(profile);
  mocks.upsert.mockReset().mockResolvedValue('person-1');
  mocks.capture.mockReset().mockResolvedValue(undefined);
  mocks.common.mockReset().mockResolvedValue({ alreadyConnected: true, warmIntro: [], sharedEmployers: [], sharedSchools: [], sharedTopics: [] });
});
async function post(value: unknown, raw = false) {
  const { POST } = await import('../app/api/person/route');
  return POST(new NextRequest('http://localhost/api/person', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw ? String(value) : JSON.stringify(value) }));
}
describe('Add Person API', () => {
  it('uses the canonical URL and preserves the exact note and submission ID', async () => {
    const response = await post({ ...body, linkedinUrl: 'https://linkedin.com/in/shamhc/?trk=test' });
    expect(response.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith(profile.linkedin_url, expect.any(AbortSignal));
    expect(mocks.capture).toHaveBeenCalledWith('person-1', body.requestId, body.note);
  });
  it.each([null, new DOMException('Timed out', 'TimeoutError'), new Error('Unavailable')])('offers manual entry on provider failure', async (failure) => {
    if (failure) mocks.resolve.mockRejectedValue(failure); else mocks.resolve.mockResolvedValue(null);
    expect(await (await post(body)).json()).toEqual({ ok: true, enrichmentFailed: true });
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it('implements manual saves using the original LinkedIn URL', async () => {
    expect((await post({ ...body, manual: true, manualName: 'Test Contact', manualCompany: 'Tools', isHiring: true })).status).toBe(200);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ linkedin_url: body.linkedinUrl, name: 'Test Contact', current_company: 'Tools' }));
    expect(mocks.query).toHaveBeenCalled();
  });
  it('assigns an internal identity to a manual contact without LinkedIn', async () => {
    expect((await post({ ...body, linkedinUrl: '', manual: true, manualName: 'Offline Contact' })).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'contact:test-submission', linkedin_url: '' }));
  });
  it('returns success with a warning when common-ground lookup fails after saving', async () => {
    mocks.common.mockRejectedValue(new Error('Graph temporarily unavailable'));
    const response = await post(body);
    expect(response.status).toBe(200);
    expect((await response.json()).warnings).toContain('Person saved. Common ground is temporarily unavailable.');
    expect(mocks.capture).toHaveBeenCalledTimes(1);
  });
  it('returns JSON when a graph write fails', async () => {
    mocks.capture.mockRejectedValue(new Error('Graph write failed'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await post(body);
      expect(response.status).toBe(503);
      expect((await response.json()).error).toContain('Please retry');
    } finally { log.mockRestore(); }
  });
  it.each([{}, null, { linkedinUrl: 'https://linkedin.com.evil.example/in/test' }])('rejects invalid requests', async (value) => {
    expect((await post(value)).status).toBe(400);
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it('handles malformed request JSON', async () => { expect((await post('{bad', true)).status).toBe(400); });
});
