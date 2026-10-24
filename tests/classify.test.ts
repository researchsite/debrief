import { describe, it, expect, vi } from 'vitest';

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'Code: SLIDE123\nStripe presents...' }),
}));

describe('extractPdfText', () => {
  it('returns text from PDF buffer', async () => {
    const { extractPdfText } = await import('../lib/classify');
    const result = await extractPdfText(Buffer.from('fake pdf'));
    expect(result).toContain('SLIDE123');
  });
});
