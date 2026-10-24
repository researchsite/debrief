import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), jsonCompletion: vi.fn() }));
vi.mock('../lib/graph', () => ({ query: mocks.query, roQuery: vi.fn() }));
vi.mock('../lib/graph-writes', () => ({ writeSession: vi.fn(), writeMeetPlan: vi.fn(), writePerson: vi.fn() }));
vi.mock('../lib/brightdata', () => ({ fetchPage: vi.fn(async () => '<h1>Blocked</h1>'), fetchProfiles: vi.fn(), serpSearch: vi.fn() }));
vi.mock('../lib/openai', () => ({ jsonCompletion: mocks.jsonCompletion }));

beforeEach(() => vi.clearAllMocks());

describe('event extraction validation', () => {
  it('rejects a blank extraction before writing any graph data', async () => {
    mocks.jsonCompletion.mockResolvedValue({ event: { name: '', date: '', venue: '' }, sessions: [] });
    const { extractEventFromUrl } = await import('../lib/event-extract');
    await expect(extractEventFromUrl('https://example.com')).rejects.toThrow('Could not identify an event');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('does not invent a duration for a point-in-time agenda entry', async () => {
    mocks.jsonCompletion.mockResolvedValue({
      event: { name: 'Conference', date: '2026-10-24', venue: 'SF' },
      sessions: [{ title: 'Lunch arrives', starts: '14:00', ends: '14:00', room: '', abstract: '', speakers: [] }],
    });
    const { extractEventFromUrl } = await import('../lib/event-extract');
    const extraction = await extractEventFromUrl('https://example.com');
    expect(extraction.sessions[0].ends).toBe('');
  });
});
