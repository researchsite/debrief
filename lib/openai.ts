import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

export class JsonCompletionError extends Error {
  constructor(
    message: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'JsonCompletionError';
  }
}

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new JsonCompletionError(
        'OPENAI_API_KEY is missing. Add it to .env.local and restart the dev server.',
        null,
      );
    }
    _client = new OpenAI({
      apiKey,
    });
  }
  return _client;
}

export async function jsonCompletion<T>(
  messages: ChatCompletionMessageParam[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  const client = getClient();
  let rawContent: string | null = null;
  try {
    const response = await client.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages,
        response_format: { type: 'json_object' },
      },
      { signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 20_000) },
    );

    rawContent = response.choices[0]?.message?.content ?? null;
    if (!rawContent) {
      throw new JsonCompletionError('Empty response from OpenAI', null);
    }
    return JSON.parse(rawContent) as T;
  } catch (err) {
    if (err instanceof JsonCompletionError) throw err;
    throw new JsonCompletionError(
      `OpenAI completion failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}
