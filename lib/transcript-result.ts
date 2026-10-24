export const CONVERSATION_CATEGORIES = {
  hiring: 'Hiring & careers',
  collaboration: 'Collaboration',
  technical: 'Technical discussion',
  advice: 'Advice & learning',
  networking: 'Networking',
  other: 'Other',
  noise: 'Noise / small talk',
} as const;

export type ConversationCategory = keyof typeof CONVERSATION_CATEGORIES;

export interface ConversationExtraction {
  who: { name: string; company: string; role: string; clues: string };
  category: ConversationCategory;
  summary: string;
  key_points: string[];
  topics: string[];
  promises: string[];
  follow_up_needed: boolean;
  confidence: number;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function list(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  const unique = new Map<string, string>();
  for (const value of values) {
    const item = text(value);
    if (item && !unique.has(item.toLowerCase())) unique.set(item.toLowerCase(), item);
  }
  return [...unique.values()];
}

/** Validate model JSON at runtime; TypeScript generics do not validate it. */
export function normalizeConversationExtraction(value: unknown): ConversationExtraction {
  const data = record(value);
  if (Object.keys(data).length === 0 || !('summary' in data)) {
    throw new Error('No usable conversation analysis was returned. Please retry this file.');
  }
  const who = record(data.who);
  const category = typeof data.category === 'string' && Object.hasOwn(CONVERSATION_CATEGORIES, data.category)
    ? data.category as ConversationCategory : 'other';
  const promises = list(data.promises);
  return {
    who: { name: text(who.name), company: text(who.company), role: text(who.role), clues: text(who.clues) },
    category,
    summary: text(data.summary),
    key_points: list(data.key_points),
    topics: list(data.topics),
    promises,
    follow_up_needed: promises.length > 0 && data.follow_up_needed === true,
    confidence: typeof data.confidence === 'number' && Number.isFinite(data.confidence)
      ? Math.max(0, Math.min(1, data.confidence)) : 0,
  };
}

export function isMeaningfulConversation(extraction: ConversationExtraction): boolean {
  return extraction.category !== 'noise' && Boolean(extraction.summary || extraction.key_points.length || extraction.promises.length);
}

/** Unknown speakers must not all collapse into a single placeholder person. */
export function transcriptPersonName(name: string, index: number): string {
  return name || `Unknown person ${index + 1}`;
}

export function transcriptPersonUrl(name: string, filename: string, index: number): string {
  return name
    ? `placeholder:${encodeURIComponent(name.replace(/\s+/g, '-').toLowerCase())}`
    : `placeholder:transcript:${encodeURIComponent(filename)}:${index}`;
}
