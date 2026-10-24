import { describe, it, expect, vi } from 'vitest';
import { jsonCompletion } from '../lib/openai';
import { parseVtt } from '../lib/vtt-parser';
import { splitConversations } from '../lib/vtt-splitter';
import fs from 'fs';
import path from 'path';
import { normalizeConversationExtraction, transcriptPersonUrl } from '../lib/transcript-result';

vi.mock('../lib/openai', () => ({
  jsonCompletion: vi.fn().mockResolvedValue({
    who: { name: 'Alex Rivera', company: 'Stripe', role: 'Staff Engineer', clues: 'Introduced himself' },
    summary: 'Talked about graph databases and a job opportunity',
    key_points: ['Alex works on payments API', 'Stripe is hiring backend engineers', 'Will connect on LinkedIn'],
    topics: ['graph databases', 'payments', 'hiring'],
    promises: ['Alex will send the job link', 'I will send my demo'],
    follow_up_needed: true,
    confidence: 0.95,
  }),
  JsonCompletionError: class extends Error {},
}));

import { extractConversation } from '../lib/transcript-extract';

describe('parseVtt', () => {
  it('supports minute timestamps, named cues, voice tags and CRLF', () => {
    const cues = parseVtt('\uFEFFWEBVTT\r\n\r\nintro\r\n00:01.000 --> 00:03.000 align:start\r\n<v María-José>Graph &amp; memory</v>\r\n\r\nNOTE internal note\r\nIgnore me\r\n');
    expect(cues).toEqual([{ id: 'intro', start: 1, end: 3, speaker: 'María-José', text: 'Graph & memory' }]);
    expect(splitConversations(cues)[0].text).toBe('María-José: Graph & memory');
  });

  it('ignores malformed and backwards cues', () => {
    expect(parseVtt('WEBVTT\n\nbad\n00:90.000 --> 00:91.000\nNo\n\n00:03.000 --> 00:01.000\nNo')).toEqual([]);
  });
  it('parses the sample VTT into 12 cues', () => {
    const vtt = fs.readFileSync(path.join(process.cwd(), 'fixtures/transcripts/sample.vtt'), 'utf-8');
    const cues = parseVtt(vtt);
    expect(cues.length).toBe(12);
    expect(cues[0].text).toContain('Alex Rivera');
  });
});

describe('conversation result validation', () => {
  it('normalizes missing person fields and deduplicates labels without inventing followups', () => {
    const result = normalizeConversationExtraction({
      who: null, summary: 'Discussed storage', category: 'technical',
      topics: [' Graphs ', null, 'graphs', {}, 'storage'],
      key_points: 'Storage tradeoffs', promises: null, follow_up_needed: 'true', confidence: 8,
    });
    expect(result.who).toEqual({ name: '', company: '', role: '', clues: '' });
    expect(result.topics).toEqual(['Graphs', 'storage']);
    expect(result.key_points).toEqual(['Storage tradeoffs']);
    expect(result.follow_up_needed).toBe(false);
    expect(result.confidence).toBe(1);
    expect(result.category).toBe('technical');
  });

  it('does not create the same placeholder for unrelated unknown people', () => {
    expect(transcriptPersonUrl('', 'first.vtt', 0)).not.toBe(transcriptPersonUrl('', 'second.vtt', 0));
    expect(transcriptPersonUrl('', 'first.vtt', 0)).not.toBe(transcriptPersonUrl('', 'first.vtt', 1));
  });
});

describe('splitConversations', () => {
  it('splits sample VTT into exactly 2 conversations', () => {
    const vtt = fs.readFileSync(path.join(process.cwd(), 'fixtures/transcripts/sample.vtt'), 'utf-8');
    const cues = parseVtt(vtt);
    const chunks = splitConversations(cues);
    expect(chunks.length).toBe(2);
  });

  it('first chunk contains Alex Rivera content', () => {
    const vtt = fs.readFileSync(path.join(process.cwd(), 'fixtures/transcripts/sample.vtt'), 'utf-8');
    const chunks = splitConversations(parseVtt(vtt));
    expect(chunks[0].text).toContain('Alex Rivera');
    expect(chunks[1].text).toContain('Maya Chen');
  });

  it('gap between chunks exceeds 90 seconds', () => {
    const vtt = fs.readFileSync(path.join(process.cwd(), 'fixtures/transcripts/sample.vtt'), 'utf-8');
    const chunks = splitConversations(parseVtt(vtt));
    const gap = chunks[1].starts - chunks[0].ends;
    expect(gap).toBeGreaterThan(90);
  });
});

describe('extractConversation (mocked)', () => {
  it('normalizes a missing name before the review screen builds a placeholder', async () => {
    vi.mocked(jsonCompletion).mockResolvedValueOnce({
      who: { name: null, company: null, role: null }, summary: 'Discussed graph storage',
      topics: null, key_points: null, promises: null, confidence: null,
    });
    const result = await extractConversation('We discussed graph storage.');
    expect(() => result.who.name.replace(/\s+/g, '-')).not.toThrow();
    expect(result.who.name).toBe('');
    expect(result.topics).toEqual([]);
    expect(result.confidence).toBe(0);
  });

  it('rejects an empty model response with a readable retry message', async () => {
    vi.mocked(jsonCompletion).mockResolvedValueOnce(null);
    await expect(extractConversation('Useful discussion')).rejects.toThrow(/retry/i);
  });

  it('extracts who and topics', async () => {
    const result = await extractConversation('Hi, I am Alex Rivera from Stripe...');
    expect(result.who.name).toBe('Alex Rivera');
    expect(result.follow_up_needed).toBe(true);
  });
});
