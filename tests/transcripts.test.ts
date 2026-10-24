import { describe, it, expect, vi } from 'vitest';
import { parseVtt } from '../lib/vtt-parser';
import { splitConversations } from '../lib/vtt-splitter';
import fs from 'fs';
import path from 'path';

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
  it('parses the sample VTT into 12 cues', () => {
    const vtt = fs.readFileSync(path.join(process.cwd(), 'fixtures/transcripts/sample.vtt'), 'utf-8');
    const cues = parseVtt(vtt);
    expect(cues.length).toBe(12);
    expect(cues[0].text).toContain('Alex Rivera');
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
  it('extracts who and topics', async () => {
    const result = await extractConversation('Hi, I am Alex Rivera from Stripe...');
    expect(result.who.name).toBe('Alex Rivera');
    expect(result.follow_up_needed).toBe(true);
  });
});
