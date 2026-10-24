// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ completion: vi.fn(), read: vi.fn(), person: vi.fn(), transcript: vi.fn(), conversation: vi.fn() }));
vi.mock('../lib/openai', () => ({ jsonCompletion: mocks.completion }));
vi.mock('../lib/graph', () => ({ roQuery: mocks.read }));
vi.mock('../lib/graph-writes', () => ({ writePerson: mocks.person, writeTranscript: mocks.transcript, writeConversation: mocks.conversation }));
import { POST as analyze } from '../app/api/transcripts/route';
import { POST as confirm } from '../app/api/transcripts/confirm/route';

const extraction = { who: { name: null }, summary: 'Discussed graph storage', category: 'technical', key_points: ['Use a graph'], topics: ['graphs'], promises: [], follow_up_needed: false, confidence: null };
const vtt = 'WEBVTT\n\n00:00.000 --> 00:10.000\nDiscussed graph storage\n\n03:00.000 --> 03:10.000\nUm, testing, testing\n';
function upload(text: string, name = 'Second.vtt') {
  const body = new FormData();
  body.append('file', new File([text], name, { type: 'text/vtt' }));
  return new NextRequest('http://localhost/api/transcripts', { method: 'POST', body });
}
function confirmation(confirms: unknown[]) {
  return new NextRequest('http://localhost/api/transcripts/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: 'Second.vtt', confirms }) });
}
const confirmed = { index: 0, personUrl: 'placeholder:unknown:0', personName: 'Unknown person 1', starts: 0, ends: 10, extraction, skip: false };

beforeEach(() => { vi.resetAllMocks(); });

describe('transcript import boundary', () => {
  it('keeps an unnamed substantive conversation and drops a noise-only segment before review', async () => {
    mocks.completion.mockResolvedValueOnce(extraction).mockResolvedValueOnce({ ...extraction, category: 'noise', summary: '' });
    const response = await analyze(upload(vtt, 'Second.VTT'));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.items).toHaveLength(1);
    expect(data.items[0].extraction.who.name).toBe('');
    expect(data.items[0].extraction.category).toBe('technical');
    expect(data.ignoredCount).toBe(1);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.conversation).not.toHaveBeenCalled();
  });

  it('rejects a file without readable cues without calling AI', async () => {
    const response = await analyze(upload('WEBVTT\n\nNo timestamps'));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('No readable');
    expect(mocks.completion).not.toHaveBeenCalled();
  });

  it('keeps source timestamps aligned when an earlier segment is noise', async () => {
    mocks.completion.mockResolvedValueOnce({ ...extraction, category: 'noise' }).mockResolvedValueOnce(extraction);
    const data = await (await analyze(upload(vtt))).json();
    expect(data.items[0]).toMatchObject({ index: 1, starts: 180, ends: 190 });
  });

  it('saves normalized category and arrays, ignoring noise and skipped items', async () => {
    const response = await confirm(confirmation([
      { ...confirmed, extraction: { ...extraction, topics: null } },
      { ...confirmed, extraction: { ...extraction, category: 'noise' } },
      { ...confirmed, skip: true },
    ]));
    expect(await response.json()).toEqual({ ok: true, saved: 1 });
    expect(mocks.conversation).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ category: 'technical', topics: [], summary: extraction.summary }));
  });

  it('validates the full batch before writing any conversations', async () => {
    const response = await confirm(confirmation([confirmed, { ...confirmed, personUrl: null }]));
    expect(response.status).toBe(400);
    expect(mocks.person).not.toHaveBeenCalled();
    expect(mocks.transcript).not.toHaveBeenCalled();
    expect(mocks.conversation).not.toHaveBeenCalled();
  });
});
