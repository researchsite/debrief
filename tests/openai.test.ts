import { describe, expect, it, vi } from 'vitest';

describe('OpenAI configuration', () => {
  it('reports a missing API key before making a request', async () => {
    vi.resetModules();
    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const { jsonCompletion } = await import('../lib/openai');
      await expect(jsonCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow(
        'OPENAI_API_KEY is missing',
      );
    } finally {
      if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
      else process.env.OPENAI_API_KEY = previousKey;
    }
  });
});
