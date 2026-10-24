import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectGraph = vi.fn(() => ({ query: vi.fn(), roQuery: vi.fn() }));
  return { selectGraph, connect: vi.fn(async () => ({ selectGraph })) };
});

vi.mock('falkordb', () => ({ FalkorDB: { connect: mocks.connect } }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => vi.unstubAllEnvs());

describe('database connection configuration', () => {
  it('uses the complete TLS URL even when local host settings exist', async () => {
    const url = 'falkors://demo:example@graph.example.com:60295';
    vi.stubEnv('FALKORDB_URL', url);
    vi.stubEnv('FALKORDB_HOST', 'localhost');
    vi.stubEnv('FALKORDB_PORT', '6379');
    const { getGraph } = await import('../lib/graph');
    await getGraph('debrief');
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({ url }));
    expect(mocks.selectGraph).toHaveBeenCalledWith('debrief');
    await getGraph('debrief');
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it('retains host and port support when no URL is configured', async () => {
    vi.stubEnv('FALKORDB_URL', '');
    vi.stubEnv('FALKORDB_HOST', 'localhost');
    vi.stubEnv('FALKORDB_PORT', '6380');
    const { getGraph } = await import('../lib/graph');
    await getGraph('debrief');
    expect(mocks.connect).toHaveBeenCalledWith({ socket: { host: 'localhost', port: 6380 } });
  });
});
