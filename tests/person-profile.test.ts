// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ roQuery: vi.fn(), query: vi.fn(), fetchProfiles: vi.fn() }));
vi.mock('../lib/graph', () => ({ query: mocks.query, roQuery: mocks.roQuery }));
vi.mock('../lib/brightdata', () => ({ fetchProfiles: mocks.fetchProfiles }));
import { resolvePersonProfile, normalizeProfile, normalizeLinkedInUrl, upsertContactProfile, captureMeeting } from '../lib/person-profile';
beforeEach(() => { vi.clearAllMocks(); mocks.roQuery.mockResolvedValue({ data: [] }); mocks.query.mockResolvedValue({ data: [{ captureId: 'test' }] }); });
describe('profile normalization and capture', () => {
  it('uses imported details without an enrichment request', async () => {
    mocks.roQuery.mockResolvedValue({ data: [{ name: 'Imported Contact', headline: 'Engineer', companies: ['Tools'], skills: ['Spark'], schools: [], past_companies: [], linkedin_url: 'https://www.linkedin.com/in/shamhc/' }] });
    const result = await resolvePersonProfile('https://www.linkedin.com/in/shamhc');
    expect(result).toMatchObject({ name: 'Imported Contact', current_company: 'Tools', skills: ['Spark'] });
    expect(mocks.fetchProfiles).not.toHaveBeenCalled();
  });
  it('normalizes provider objects before they can become graph parameters', () => {
    expect(normalizeProfile({ name: 'Contact', current_company: { name: 'Tools' }, education: [{ name: 'School' }], skills: [{ name: 'Spark' }, null] }, 'url')).toMatchObject({ current_company: 'Tools', schools: ['School'], skills: ['Spark'] });
    expect(normalizeProfile({ error: 'Unavailable' }, 'url')).toBeNull();
    expect(normalizeProfile({ name: { unexpected: 'object' } }, 'url')).toBeNull();
  });
  it('does not create meetings or notes when saving a contact', async () => {
    await upsertContactProfile({ id: 'contact:test', linkedin_url: '', name: 'Contact', headline: '', city: '', current_company: 'Tools', schools: [], past_companies: [], skills: [] });
    expect(mocks.query.mock.calls.map(([cypher]) => cypher).join(' ')).not.toMatch(/:MET|:Note/);
  });
  it('uses the same capture identity for retries', async () => {
    await captureMeeting('person-1', 'request-1', 'Original note');
    await captureMeeting('person-1', 'request-1', 'Original note');
    expect(mocks.query.mock.calls[0][1].captureId).toBe(mocks.query.mock.calls[1][1].captureId);
    expect(mocks.query.mock.calls[0][0]).toContain('ON CREATE SET n.text');
  });
  it('normalizes tracking URLs and rejects misleading domains', () => {
    expect(normalizeLinkedInUrl('https://linkedin.com/in/contact/?trk=qr')).toBe('https://www.linkedin.com/in/contact');
    expect(() => normalizeLinkedInUrl('https://linkedin.com.evil.example/in/contact')).toThrow();
  });
});
