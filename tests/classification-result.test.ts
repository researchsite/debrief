import { describe, expect, it, vi } from 'vitest';
import { normalizeClassificationResult } from '../lib/classification-result';

const mocks = vi.hoisted(() => ({ completion: vi.fn() }));
vi.mock('../lib/openai', () => ({ jsonCompletion: mocks.completion }));

describe('classification data boundary', () => {
  it('converts structured coupon values to readable text', () => {
    expect(normalizeClassificationResult({
      kind: 'coupon', code: 'PATCH50', vendor: 'Bright Data',
      value: { description: '$50 credits', url: 'https://example.com', code: 'PATCH50' },
    })).toMatchObject({ kind: 'coupon', code: 'PATCH50', value: '$50 credits', expires: null });
  });

  it('normalizes structured slide ideas, topics, and links', () => {
    expect(normalizeClassificationResult({
      kind: 'slide', title: 'Graph memory', speaker: { name: 'Demo Speaker' },
      ideas: [{ description: 'Follow graph paths', url: 'https://example.com', code: 'demo' }],
      topics: [{ name: 'graphs' }], links: [{ description: 'More info', url: 'https://example.com' }],
    })).toMatchObject({
      title: 'Graph memory', speaker: 'Demo Speaker', ideas: ['Follow graph paths'],
      topics: ['graphs'], links: ['https://example.com'],
    });
  });

  it('fills missing optional fields so editing an incomplete slide works', () => {
    expect(normalizeClassificationResult({ kind: 'slide', title: 'Graph memory' })).toEqual({
      kind: 'slide', title: 'Graph memory', speaker: '', ideas: [], topics: [], links: [],
    });
  });

  it.each([null, [], { error: 'Upstream failure' }, { kind: 'unsupported' }, { kind: 'coupon', value: { unexpected: {} } }])(
    'rejects unusable extraction data instead of passing it to React', (value) => {
      expect(() => normalizeClassificationResult(value)).toThrow();
    },
  );

  it('normalizes image and PDF model responses before returning them', async () => {
    mocks.completion.mockResolvedValue({ kind: 'other', text: { description: 'Read this QR', url: 'https://example.com', code: '123' } });
    const { classifyImage, classifyPdfText } = await import('../lib/classify');
    expect(await classifyImage('image', 'image/png')).toMatchObject({ kind: 'other', text: 'Read this QR' });
    expect(await classifyPdfText('document')).toMatchObject({ kind: 'other', text: 'Read this QR' });
  });
});
