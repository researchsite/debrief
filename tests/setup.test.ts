import { describe, it, expect, afterAll } from 'vitest';
import { writeSetup, writeLinkedInArchive } from '../lib/graph-writes';
import { roQuery, query } from '../lib/graph';

const G = 'debrief_test';
const ME_URL = 'https://www.linkedin.com/in/test-setup-user';

afterAll(async () => {
  await query('MATCH (n) WHERE n.linkedin_url = $url DETACH DELETE n', { url: ME_URL }, G);
  await query('MATCH (n:Intent) WHERE n.name IN $intents DETACH DELETE n',
    { intents: ['job_hunt', 'learning'] }, G);
  await query('MATCH (n:Event {name: "Test Event"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Role {title: "Test Engineer"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Company {name: "TestCorp"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:School {name: "Test U"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Skill {name: "typescript"}) DETACH DELETE n', {}, G);
});

describe('writeSetup', () => {
  it('creates Me, Event, Role, and Intent nodes', async () => {
    await writeSetup({
      name: 'Test Person',
      linkedinUrl: ME_URL,
      eventName: 'Test Event',
      eventDate: '2026-10-24',
      targetRole: 'Test Engineer',
      intents: ['job_hunt', 'learning'],
      primaryIntent: 'job_hunt',
    }, G);

    const r = await roQuery(
      'MATCH (me:Me {linkedin_url: $url})-[:ATTENDED]->(e:Event) ' +
      'MATCH (me)-[:WANTS]->(role:Role) RETURN me.name AS name, e.name AS event, role.title AS role',
      { url: ME_URL }, G
    );
    expect(r.data![0].name).toBe('Test Person');
    expect(r.data![0].event).toBe('Test Event');
    expect(r.data![0].role).toBe('Test Engineer');

    const intents = await roQuery(
      'MATCH (me:Me {linkedin_url: $url})-[r:HAS_INTENT]->(i:Intent) RETURN i.name AS name, r.primary AS primary',
      { url: ME_URL }, G
    );
    expect(intents.data!).toHaveLength(2);
    const primary = intents.data!.find((d: Record<string, unknown>) => d.primary === true);
    expect(primary?.name).toBe('job_hunt');
  });
});

describe('writeLinkedInArchive', () => {
  it('attaches company, school, skill nodes to Me', async () => {
    await writeSetup({
      name: 'Test Person', linkedinUrl: ME_URL, eventName: 'Test Event',
      eventDate: '2026-10-24', targetRole: 'Test Engineer',
      intents: ['networking'], primaryIntent: 'networking',
    }, G);

    await writeLinkedInArchive(ME_URL, {
      headline: 'Senior Engineer',
      currentCompany: 'TestCorp',
      pastCompanies: [],
      schools: [{ name: 'Test U', degree: 'BS CS' }],
      skills: ['TypeScript'],
    }, G);

    const result = await roQuery(
      'MATCH (me:Me {linkedin_url: $url}) ' +
      'OPTIONAL MATCH (me)-[:WORKS_AT]->(c:Company) ' +
      'OPTIONAL MATCH (me)-[:STUDIED_AT]->(s:School) ' +
      'OPTIONAL MATCH (me)-[:HAS_SKILL]->(sk:Skill) ' +
      'RETURN c.name AS company, s.name AS school, sk.name AS skill',
      { url: ME_URL }, G
    );
    expect(result.data![0].company).toBe('TestCorp');
    expect(result.data![0].school).toBe('Test U');
    expect(result.data![0].skill).toBe('typescript');
  });
});
