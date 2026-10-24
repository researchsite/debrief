import { describe, it, expect, afterAll, vi } from 'vitest';
import { writeSetup, writePerson, writeSession, writeMeetPlan, getMeetPlan, writeMet } from '../lib/graph-writes';
import { query, roQuery } from '../lib/graph';

const G = 'debrief_test';
const ME_URL = 'https://www.linkedin.com/in/test-event-me';
const SPEAKER_URL = 'https://www.linkedin.com/in/alex-rivera-fake';

afterAll(async () => {
  await query('MATCH (n:Me {linkedin_url: $url}) DETACH DELETE n', { url: ME_URL }, G);
  await query('MATCH (n:Person {linkedin_url: $url}) DETACH DELETE n', { url: SPEAKER_URL }, G);
  await query('MATCH (n:Session {title: "Test Session"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Event {name: "Test Event"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Company {name: "Stripe"}) DETACH DELETE n', {}, G);
});

describe('event graph writes', () => {
  it('creates Session and SPEAKS_AT edge', async () => {
    await writeSetup({ name: 'Test Me', linkedinUrl: ME_URL, eventName: 'Test Event', eventDate: '2026-10-24', targetRole: 'Eng', intents: ['networking'], primaryIntent: 'networking' }, G);
    await writePerson({
      linkedinUrl: SPEAKER_URL, name: 'Alex Rivera', headline: 'Engineer at Stripe', city: 'SF',
      currentCompany: 'Stripe', pastCompanies: [], schools: [], skills: [], topics: [],
      noteText: '', isHiring: false,
    }, G);
    await writeSession({
      title: 'Test Session', starts: '10:00', ends: '11:00', room: 'Main Hall',
      abstract: 'A test session', eventName: 'Test Event', speakerUrl: SPEAKER_URL,
    }, G);

    const r = await roQuery(
      'MATCH (p:Person {linkedin_url: $url})-[:SPEAKS_AT]->(s:Session) RETURN s.title AS title',
      { url: SPEAKER_URL }, G
    );
    expect(r.data![0].title).toBe('Test Session');
  });

  it('writes and reads meet plan', async () => {
    await writeMeetPlan([{
      personUrl: SPEAKER_URL, score: 5, reasons: ['Already connected'], via: [], opener: 'Great to finally meet in person!',
    }], G);

    const plan = await getMeetPlan(G);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan![0].score).toBe(5);
    expect(plan![0].opener).toBe('Great to finally meet in person!');
  });

  it('creates MET edge', async () => {
    await writeMet(SPEAKER_URL, G);
    const r = await roQuery(
      'MATCH (me:Me {linkedin_url: $meUrl})-[:MET]->(p:Person {linkedin_url: $url}) RETURN count(p) AS cnt',
      { meUrl: ME_URL, url: SPEAKER_URL }, G
    );
    expect(Number(r.data![0].cnt)).toBe(1);
  });
});

// Mock OpenAI and BrightData for extractEventFromUrl test
vi.mock('../lib/openai', () => ({
  jsonCompletion: vi.fn()
    .mockResolvedValueOnce({
      event: { name: 'DevConf 2026', date: '2026-10-24', venue: 'SF' },
      sessions: [{
        title: 'Building Real-Time Payment Systems', starts: '10:00', ends: '11:00', room: 'Main Hall', abstract: 'Test abstract',
        speakers: [{ name: 'Alex Rivera', title: 'Staff Engineer', company: 'Stripe', linkedin_url: 'https://www.linkedin.com/in/alex-rivera-fake' }],
      }],
    })
    .mockResolvedValue({ opener: 'Great to meet you!' }),
  JsonCompletionError: class extends Error {},
}));

describe('extractEventFromUrl (mocked)', () => {
  it('writes Event, Session, Person and meet plan to graph', async () => {
    const { extractEventFromUrl } = await import('../lib/event-extract');
    await extractEventFromUrl('https://fake-event.example.com', G);

    const r = await roQuery(
      'MATCH (p:Person)-[:SPEAKS_AT]->(s:Session)-[:PART_OF]->(e:Event {name: "DevConf 2026"}) RETURN p.name AS speaker',
      {}, G
    );
    expect(r.data!.length).toBeGreaterThan(0);
  });
});
