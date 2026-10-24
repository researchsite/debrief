import { describe, it, expect, afterAll, vi, beforeEach } from 'vitest';
import { writeContext, getContext, writeSetup, writePerson } from '../lib/graph-writes';
import { query } from '../lib/graph';
import { researchPerson } from '../lib/research';

const G = 'debrief_test';
const ME_URL = 'https://www.linkedin.com/in/test-research-me';
const PERSON_URL = 'https://www.linkedin.com/in/test-research-alex';

// Mock OpenAI
vi.mock('../lib/openai', () => ({
  jsonCompletion: vi.fn().mockResolvedValue({
    summary: 'Test summary from mock',
    bullets: [{ text: 'Works on payments', source_url: 'https://example.com' }],
  }),
  JsonCompletionError: class JsonCompletionError extends Error {},
}));

afterAll(async () => {
  await query('MATCH (n) WHERE n.linkedin_url IN [$me, $p] DETACH DELETE n', { me: ME_URL, p: PERSON_URL }, G);
  await query('MATCH (n:Company {name: "ResearchCo"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Source) WHERE n.url STARTS WITH "https://techcrunch.com/fake" DETACH DELETE n', {}, G);
});

describe('writeContext / getContext', () => {
  it('writes and reads Context with Source citations', async () => {
    // First ensure Person node exists (writeContext needs a Person node to MATCH against)
    await writePerson({
      linkedinUrl: PERSON_URL,
      name: 'Alex Research',
      headline: 'Engineer',
      city: 'SF',
      currentCompany: 'ResearchCo',
      pastCompanies: [],
      schools: [],
      skills: [],
      topics: [],
      noteText: 'Test note',
      isHiring: false,
    }, G);

    await writeContext({
      personUrl: PERSON_URL,
      summary: 'Expert in payments',
      bullets: [{ text: 'Works at Stripe on payments APIs', source_url: 'https://techcrunch.com/fake-1' }],
      sources: [{ url: 'https://techcrunch.com/fake-1', title: 'Stripe article' }],
    }, G);

    const ctx = await getContext(PERSON_URL, G);
    expect(ctx).not.toBeNull();
    expect(ctx!.summary).toBe('Expert in payments');
    expect(ctx!.bullets[0].text).toBe('Works at Stripe on payments APIs');
    expect(ctx!.sources[0].title).toBe('Stripe article');
  });
});

describe('researchPerson', () => {
  beforeEach(async () => {
    // Clean up any context from previous test runs
    await query(
      'MATCH (p:Person {linkedin_url: $url})-[:HAS_CONTEXT]->(ctx:Context) DETACH DELETE ctx',
      { url: PERSON_URL },
      G,
    );
  });

  it('calls serpSearch and writeContext when no existing context', async () => {
    // Set up a person with a company
    await writeSetup({ name: 'Test Me', linkedinUrl: ME_URL, eventName: 'Test', eventDate: '2026-10-24', targetRole: 'Eng', intents: ['networking'], primaryIntent: 'networking' }, G);
    await writePerson({
      linkedinUrl: PERSON_URL, name: 'Alex Research', headline: 'Engineer', city: 'SF',
      currentCompany: 'ResearchCo', pastCompanies: [], schools: [], skills: [], topics: [],
      noteText: 'Test note', isHiring: false,
    }, G);

    await researchPerson(PERSON_URL, 'Alex Research', 'ResearchCo', G);

    const ctx = await getContext(PERSON_URL, G);
    expect(ctx).not.toBeNull();
    expect(ctx!.summary).toBe('Test summary from mock');
  });

  it('skips research if context is fresh (within 7 days)', async () => {
    const { jsonCompletion } = await import('../lib/openai');
    const mockFn = vi.mocked(jsonCompletion);
    mockFn.mockClear();

    // Write a fresh context first
    await writeContext({
      personUrl: PERSON_URL,
      summary: 'Fresh context',
      bullets: [],
      sources: [],
    }, G);

    // Context already exists and is fresh — should skip
    await researchPerson(PERSON_URL, 'Alex Research', 'ResearchCo', G);

    // Should NOT call jsonCompletion again
    expect(mockFn).not.toHaveBeenCalled();
  });
});
