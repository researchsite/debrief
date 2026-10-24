import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  writeSetup, writePerson, writeTalkNote, writeCoupon, writeMet,
  getRecapCounts, getRecapIdeas, getRecapPeopleForIntent,
  getFollowUps, saveFollowUp, getWhyPath,
} from '../lib/graph-writes';
import { query } from '../lib/graph';

// Mock openai to avoid real API calls in tests
vi.mock('../lib/openai', () => ({
  jsonCompletion: vi.fn().mockResolvedValue({ message: 'Mocked follow-up message.' }),
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
const ME_URL = 'https://www.linkedin.com/in/test-recap-me';

beforeAll(async () => {
  // Setup Me
  await writeSetup({
    name: 'Recap Tester',
    linkedinUrl: ME_URL,
    eventName: 'Recap Event',
    eventDate: '2026-10-24',
    targetRole: 'Backend Engineer',
    intents: ['job_hunt', 'learning'],
    primaryIntent: 'job_hunt',
  }, G);

  // 6 fake people
  const people = [
    { url: 'https://linkedin.com/in/recap-p1', name: 'Alice Chen', company: 'Stripe', skills: ['python'], isHiring: true },
    { url: 'https://linkedin.com/in/recap-p2', name: 'Bob Kim', company: 'Notion', skills: ['react'], isHiring: false },
    { url: 'https://linkedin.com/in/recap-p3', name: 'Carol Lopez', company: 'FalkorDB', skills: ['cypher'], isHiring: true },
    { url: 'https://linkedin.com/in/recap-p4', name: 'Dave Park', company: 'Bright Data', skills: ['nodejs'], isHiring: false },
    { url: 'https://linkedin.com/in/recap-p5', name: 'Eve Osei', company: 'Stripe', skills: ['go'], isHiring: true },
    { url: 'https://linkedin.com/in/recap-p6', name: 'Frank Wu', company: 'Qodo', skills: ['typescript'], isHiring: false },
  ];
  for (const p of people) {
    await writePerson({
      linkedinUrl: p.url,
      name: p.name,
      headline: `Engineer at ${p.company}`,
      city: 'SF',
      currentCompany: p.company,
      pastCompanies: [],
      schools: [],
      skills: p.skills,
      topics: ['graph databases'],
      noteText: `Met ${p.name} at the event`,
      isHiring: p.isHiring,
    }, G);
    await writeMet(p.url, G);
  }

  // 3 sessions
  await writeTalkNote({
    sessionTitle: 'Graph Databases 101',
    speakerName: 'Alice Chen',
    noteText: 'Great intro',
    ideas: ['Graphs beat tables for multi-hop'],
    topics: ['graph databases'],
    eventName: 'Recap Event',
  }, G);
  await writeTalkNote({
    sessionTitle: 'AI Agents in Production',
    speakerName: 'Bob Kim',
    noteText: 'Loved this',
    ideas: ['Memory is the key to agentic systems'],
    topics: ['ai agents'],
    eventName: 'Recap Event',
  }, G);
  await writeTalkNote({
    sessionTitle: 'Web Scraping at Scale',
    speakerName: 'Carol Lopez',
    noteText: 'Technical deep dive',
    ideas: ['Proxy rotation solves blocks'],
    topics: ['web scraping'],
    eventName: 'Recap Event',
  }, G);

  // 1 coupon
  await writeCoupon({
    code: 'RECAP-TEST-123',
    vendor: 'FalkorDB',
    value: '$50 credit',
    description: 'FalkorDB cloud credit',
    expires: '2027-01-01',
    terms: '',
    redeemUrl: '',
    assetPath: 'test-recap-coupon.png',
  }, G);
}, 60000);

afterAll(async () => {
  await query('MATCH (n:Me {linkedin_url: $url}) DETACH DELETE n', { url: ME_URL }, G);
  for (const url of ['recap-p1', 'recap-p2', 'recap-p3', 'recap-p4', 'recap-p5', 'recap-p6'].map(s => `https://linkedin.com/in/${s}`)) {
    await query('MATCH (n:Person {linkedin_url: $url}) DETACH DELETE n', { url }, G);
  }
  for (const c of ['Stripe', 'Notion', 'FalkorDB', 'Bright Data', 'Qodo']) {
    await query('MATCH (n:Company {name: $name}) DETACH DELETE n', { name: c }, G);
  }
  await query('MATCH (n:Session) WHERE n.title IN ["Graph Databases 101","AI Agents in Production","Web Scraping at Scale"] DETACH DELETE n', {}, G);
  await query('MATCH (n:Coupon {code: "RECAP-TEST-123"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Event {name: "Recap Event"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Role {title: "Backend Engineer"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Intent {name: $a}) DETACH DELETE n', { a: 'job_hunt' }, G);
  await query('MATCH (n:Intent {name: $a}) DETACH DELETE n', { a: 'learning' }, G);
  await query('MATCH (n:FollowUp) WHERE n.message STARTS WITH "Recap test" DETACH DELETE n', {}, G);
}, 30000);

describe('getRecapCounts', () => {
  it('returns correct counts with 6 people, 3 sessions', async () => {
    const counts = await getRecapCounts(G);
    expect(counts.peopleMet).toBeGreaterThanOrEqual(6);
    expect(counts.sessionsSaw).toBeGreaterThanOrEqual(3);
    expect(counts.ideas).toBeGreaterThanOrEqual(3);
  });
});

describe('getRecapIdeas', () => {
  it('returns ideas grouped with session titles', async () => {
    const ideas = await getRecapIdeas(G);
    expect(ideas.length).toBeGreaterThanOrEqual(3);
    expect(ideas.some(i => i.text.includes('multi-hop'))).toBe(true);
  });
});

describe('getRecapPeopleForIntent', () => {
  it('returns hiring people for job_hunt intent', async () => {
    const people = await getRecapPeopleForIntent('job_hunt', G);
    // Stripe is hiring (isHiring=true set on Alice and Eve)
    expect(people.some(p => p.company === 'Stripe')).toBe(true);
  });
});

describe('saveFollowUp / getFollowUps', () => {
  it('saves and retrieves a follow-up', async () => {
    await saveFollowUp({
      personName: 'Alice Chen',
      personUrl: 'https://linkedin.com/in/recap-p1',
      company: 'Stripe',
      message: 'Recap test: Great meeting you at the event!',
      noteSource: 'Met Alice Chen at the event',
      contextSource: '',
    }, G);
    const fus = await getFollowUps(G);
    expect(fus.some(f => f.message.includes('Recap test'))).toBe(true);
  });
});

describe('getWhyPath', () => {
  it('returns nodes and links for a person in the graph', async () => {
    const path = await getWhyPath('Alice Chen', G);
    expect(path.nodes.length).toBeGreaterThan(0);
    expect(path.nodes.some(n => n.label === 'Alice Chen' || n.label === 'Recap Tester')).toBe(true);
  });
});
