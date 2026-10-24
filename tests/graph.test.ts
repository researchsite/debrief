import { describe, it, expect, afterAll } from 'vitest';
import { query, roQuery, getGraph } from '../lib/graph';

const TEST_GRAPH = 'debrief_test';

afterAll(async () => {
  const g = await getGraph(TEST_GRAPH);
  await g.query('MATCH (n:TestNode) DETACH DELETE n');
});

describe('FalkorDB graph helpers', () => {
  it('writes and reads a node in debrief_test', async () => {
    await query(
      'MERGE (n:TestNode {id: $id}) SET n.value = $val',
      { id: 'test-1', val: 'hello' },
      TEST_GRAPH
    );
    const result = await roQuery(
      'MATCH (n:TestNode {id: $id}) RETURN n.value AS value',
      { id: 'test-1' },
      TEST_GRAPH
    );
    expect(result.data?.[0]?.value).toBe('hello');
  });
});
