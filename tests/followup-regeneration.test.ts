// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getGraph, query } from '../lib/graph';
import { getFollowUps, saveFollowUp, type FollowUpDraft } from '../lib/graph-writes';

const graph = `debrief_followup_regression_${process.pid}`;
const draft: FollowUpDraft = {
  personName: 'Test Contact',
  personUrl: 'https://linkedin.com/in/followup-regression',
  company: '',
  message: 'Original draft',
  noteSource: 'Met at the event',
  contextSource: 'Original research',
};

beforeEach(async () => {
  await query('MATCH (n) DETACH DELETE n', {}, graph);
  await query('CREATE (:Me {name: "Tester"}), (:Person {name: $name, linkedin_url: $url})',
    { name: draft.personName, url: draft.personUrl }, graph);
});

afterAll(async () => {
  await (await getGraph(graph)).delete();
});

describe('follow-up regeneration', () => {
  it('replaces the message for a person instead of adding another entry', async () => {
    await saveFollowUp(draft, graph);
    await saveFollowUp({ ...draft, message: 'Regenerated draft', contextSource: 'New research' }, graph);

    expect(await getFollowUps(graph)).toEqual([
      { ...draft, message: 'Regenerated draft', contextSource: 'New research', status: 'todo' },
    ]);
  });

  it('consolidates existing generated duplicates while preserving transcript promises', async () => {
    await query(`MATCH (me:Me), (p:Person)
      CREATE (me)-[:FOLLOW_UP]->(:FollowUp {message: 'Legacy draft 1', note_source: '', context_source: ''})-[:FOR]->(p),
             (me)-[:FOLLOW_UP]->(:FollowUp {message: 'Legacy draft 2', note_source: '', context_source: ''})-[:FOR]->(p),
             (me)-[:FOLLOW_UP]->(:FollowUp {message: 'Send the slides', status: 'todo'})-[:FOR]->(p)`, {}, graph);

    await saveFollowUp(draft, graph);
    const followUps = await getFollowUps(graph);
    expect(followUps.map(f => f.message).sort()).toEqual(['Original draft', 'Send the slides']);
    const nodes = await query('MATCH (f:FollowUp) RETURN f.message AS message', {}, graph);
    expect(nodes.data?.map(n => n.message).sort()).toEqual(['Original draft', 'Send the slides']);
  });

  it('keeps different people separate even when their messages are identical', async () => {
    const secondUrl = 'https://linkedin.com/in/second-followup-regression';
    await query('CREATE (:Person {name: "Second Contact", linkedin_url: $url})', { url: secondUrl }, graph);
    await saveFollowUp(draft, graph);
    await saveFollowUp({ ...draft, personUrl: secondUrl }, graph);
    await saveFollowUp({ ...draft, message: 'Updated for first contact' }, graph);

    const followUps = await getFollowUps(graph);
    expect(followUps).toHaveLength(2);
    expect(followUps.find(f => f.personUrl === secondUrl)?.message).toBe(draft.message);
  });

  it('preserves another recipient when a legacy draft was shared by message text', async () => {
    const secondUrl = 'https://linkedin.com/in/shared-legacy-regression';
    await query(`MATCH (me:Me), (p:Person)
      CREATE (other:Person {name: 'Other Contact', linkedin_url: $url}),
             (me)-[:FOLLOW_UP]->(old:FollowUp {message: 'Shared legacy draft', note_source: '', context_source: ''}),
             (old)-[:FOR]->(p), (old)-[:FOR]->(other)`, { url: secondUrl }, graph);

    await saveFollowUp(draft, graph);
    const followUps = await getFollowUps(graph);
    expect(followUps).toHaveLength(2);
    expect(followUps.find(f => f.personUrl === secondUrl)?.message).toBe('Shared legacy draft');
    expect(followUps.find(f => f.personUrl === draft.personUrl)?.message).toBe(draft.message);
  });

  it('does not duplicate entries when saves overlap or a person has several companies', async () => {
    await query(`MATCH (p:Person)
      CREATE (p)-[:WORKS_AT]->(:Company {name: 'Company A'}),
             (p)-[:WORKS_AT]->(:Company {name: 'Company B'})`, {}, graph);
    await Promise.all(Array.from({ length: 5 }, (_, i) =>
      saveFollowUp({ ...draft, message: `Draft ${i}` }, graph)));
    expect(await getFollowUps(graph)).toHaveLength(1);
  });

  it('supports contacts identified by an internal id', async () => {
    await query('MATCH (p:Person) REMOVE p.linkedin_url SET p.id = "contact:local"', {}, graph);
    await saveFollowUp({ ...draft, personUrl: 'contact:local' }, graph);
    expect(await getFollowUps(graph)).toEqual([{ ...draft, personUrl: 'contact:local', status: 'todo' }]);
  });
});
