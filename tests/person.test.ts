import { describe, it, expect, afterAll, vi } from 'vitest';
import { writePerson, getCommonGround, writeSetup } from '../lib/graph-writes';
import { query, roQuery } from '../lib/graph';

// Mock openai to avoid real API calls in tests
vi.mock('../lib/openai', () => ({
  jsonCompletion: vi.fn().mockResolvedValue({ topics: [] }),
  JsonCompletionError: class JsonCompletionError extends Error {
    cause: unknown;
    constructor(message: string, cause: unknown) {
      super(message);
      this.name = 'JsonCompletionError';
      this.cause = cause;
    }
  },
}));

const G = 'debrief_test';
const ME_URL = 'https://www.linkedin.com/in/test-person-me';
const PERSON_URL = 'https://www.linkedin.com/in/alex-rivera-fake';

afterAll(async () => {
  await query('MATCH (n:Me {linkedin_url: $url}) DETACH DELETE n', { url: ME_URL }, G);
  await query('MATCH (n:Person {linkedin_url: $url}) DETACH DELETE n', { url: PERSON_URL }, G);
  await query('MATCH (n:Company {name: "Stripe"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:School {name: "UC Berkeley"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Topic {name: "payments"}) DETACH DELETE n', {}, G);
});

describe('writePerson', () => {
  it('creates Person node with Company, School, Skill, Topic, Note, MET edge', async () => {
    await writeSetup({
      name: 'Test Me', linkedinUrl: ME_URL, eventName: 'Test', eventDate: '2026-10-24',
      targetRole: 'Engineer', intents: ['networking'], primaryIntent: 'networking',
    }, G);

    await writePerson({
      linkedinUrl: PERSON_URL,
      name: 'Alex Rivera',
      headline: 'Staff Engineer at Stripe',
      city: 'San Francisco, CA',
      currentCompany: 'Stripe',
      pastCompanies: ['Plaid'],
      schools: ['UC Berkeley'],
      skills: ['payments', 'go'],
      topics: ['payments'],
      noteText: 'Talked about API design',
      isHiring: false,
    }, G);

    // Check Person + Company
    const r = await roQuery(
      'MATCH (p:Person {linkedin_url: $url})-[:WORKS_AT]->(c:Company) RETURN p.name AS name, c.name AS company',
      { url: PERSON_URL }, G
    );
    expect(r.data![0].name).toBe('Alex Rivera');
    expect(r.data![0].company).toBe('Stripe');

    // Check Note
    const n = await roQuery(
      'MATCH (p:Person {linkedin_url: $url})-[:HAS_NOTE]->(note:Note) RETURN note.text AS text',
      { url: PERSON_URL }, G
    );
    expect(n.data![0].text).toBe('Talked about API design');

    // Check MET edge
    const met = await roQuery(
      'MATCH (me:Me {linkedin_url: $meUrl})-[:MET]->(p:Person {linkedin_url: $url}) RETURN count(p) AS cnt',
      { meUrl: ME_URL, url: PERSON_URL }, G
    );
    expect(Number(met.data![0].cnt)).toBe(1);
  });
});

describe('getCommonGround', () => {
  it('returns alreadyConnected=false when no CONNECTED edge', async () => {
    const cg = await getCommonGround(PERSON_URL, G);
    expect(cg.alreadyConnected).toBe(false);
  });
});
