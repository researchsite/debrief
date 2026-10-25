import { describe, it, expect, afterAll } from 'vitest';
import { writeTalkNote, getTodayTimeline, writeSetup, getEventSummary } from '../lib/graph-writes';
import { query, roQuery } from '../lib/graph';

const G = 'debrief_test';
const ME_URL = 'https://www.linkedin.com/in/test-talk-me';

afterAll(async () => {
  await query('MATCH (n:Me {linkedin_url: $url}) DETACH DELETE n', { url: ME_URL }, G);
  await query('MATCH (n:Session {title: "Test Talk"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Idea {text: "Graphs are fast"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Topic {name: "graph databases"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Person {name: "Test Speaker"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Person) WHERE n.id IN ["test-timeline-repeat", "test-timeline-yesterday"] DETACH DELETE n', {}, G);
  await query('MATCH (n:Company {name: "TimelineCo"}) DETACH DELETE n', {}, G);
});

describe('writeTalkNote', () => {
  it('creates Session, SAW edge, Idea, Topic nodes', async () => {
    await writeSetup({ name: 'Test Me', linkedinUrl: ME_URL, eventName: 'Test Event', eventDate: '2026-10-24', targetRole: 'Eng', intents: ['learning'], primaryIntent: 'learning' }, G);

    await writeTalkNote({
      sessionTitle: 'Test Talk',
      speakerName: 'Test Speaker',
      noteText: 'Graphs are amazing for multi-hop queries',
      ideas: ['Graphs are fast'],
      topics: ['graph databases'],
    }, G);

    const r = await roQuery(
      'MATCH (me:Me {linkedin_url: $url})-[:SAW]->(s:Session {title: "Test Talk"})-[:SPARKED]->(i:Idea) RETURN i.text AS idea',
      { url: ME_URL }, G
    );
    expect(r.data![0].idea).toBe('Graphs are fast');
  });
});

describe('getTodayTimeline', () => {
  it('returns the talk in the timeline', async () => {
    const timeline = await getTodayTimeline(G);
    const talkEntry = timeline.find(e => e.type === 'talk' && e.title === 'Test Talk');
    expect(talkEntry).toBeDefined();
  });

  it('lists a person met several times once, at the latest meeting today', async () => {
    const now = new Date();
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const yesterday = todayStart - 60 * 60 * 1000;
    const earlier = todayStart + 1000;
    const latest = todayStart + 2000;
    await query(
      `MATCH (me:Me {linkedin_url: $url})
       CREATE (p:Person {id: 'test-timeline-repeat', name: 'Timeline Repeat'})-[:WORKS_AT]->(:Company {name: 'TimelineCo'}),
              (y:Person {id: 'test-timeline-yesterday', name: 'Timeline Yesterday'}),
              (me)-[:MET {at: $yesterday}]->(p),
              (me)-[:MET {at: $earlier}]->(p),
              (me)-[:MET {at: $latest}]->(p),
              (me)-[:MET {at: $yesterday}]->(y)`,
      { url: ME_URL, yesterday, earlier, latest }, G,
    );

    const timeline = await getTodayTimeline(G);
    const rows = timeline.filter(e => e.type === 'person' && e.title === 'Timeline Repeat');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ timestamp: latest, subtitle: 'TimelineCo' });
    expect(timeline.some(e => e.title === 'Timeline Yesterday')).toBe(false);
  });
});

describe('getEventSummary', () => {
  it('returns the event name and primary intent', async () => {
    const summary = await getEventSummary(G);
    expect(summary?.eventName).toBe('Test Event');
    expect(summary?.primaryIntent).toBe('learning');
  });
});
