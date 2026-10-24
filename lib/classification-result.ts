import type { ClassificationResult } from './classify';

export class ClassificationResultError extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, field: string, preferred: string[] = []): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return value.map((item) => text(item, field, preferred)).filter(Boolean).join('\n');
  if (record(value)) {
    for (const key of [field, ...preferred, 'description', 'text', 'name', 'title', 'label', 'value', 'code', 'url']) {
      const candidate = value[key];
      if (typeof candidate === 'string') return candidate;
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
    }
  }
  throw new ClassificationResultError(`The extracted ${field} could not be read. Please retry this file.`);
}

function list(value: unknown, field: string, preferred: string[] = []): string[] {
  if (value == null) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => text(item, field, preferred)).filter(Boolean);
}

/** Model output is untrusted JSON, even when its TypeScript generic says otherwise. */
export function normalizeClassificationResult(value: unknown): ClassificationResult {
  if (!record(value)) throw new ClassificationResultError('No usable extraction was returned. Please retry this file.');
  const kind = value.kind;
  const field = (name: string, preferred: string[] = []) => text(value[name], name, preferred);
  switch (kind) {
    case 'coupon':
      return {
        kind, code: field('code'), vendor: field('vendor', ['name']), value: field('value'),
        description: field('description'), expires: value.expires ? field('expires') : null,
        terms: field('terms'), redeem_url: field('redeem_url', ['url']),
      };
    case 'slide':
    case 'deck':
      return {
        kind, title: field('title'), speaker: field('speaker', ['name']),
        ideas: list(value.ideas, 'ideas'), topics: list(value.topics, 'topics', ['name']),
        links: list(value.links, 'links', ['url']),
      };
    case 'badge':
    case 'business_card':
      return {
        kind, name: field('name'), company: field('company', ['name']), title: field('title'),
        email: field('email'), linkedin_url: field('linkedin_url', ['url']),
        ...(typeof value.id === 'string' ? { id: value.id } : {}),
        ...(typeof value.phone === 'string' ? { phone: value.phone } : {}),
      };
    case 'agenda': {
      if (value.sessions != null && !Array.isArray(value.sessions)) {
        throw new ClassificationResultError('The extracted agenda could not be read. Please retry this file.');
      }
      return { kind, sessions: (value.sessions ?? []).map((session: unknown) => {
        if (!record(session)) throw new ClassificationResultError('An extracted session could not be read. Please retry this file.');
        return {
          title: text(session.title, 'title'), starts: text(session.starts, 'starts'),
          room: text(session.room, 'room'), speaker: text(session.speaker, 'speaker', ['name']),
        };
      }) };
    }
    case 'qr':
    case 'other':
      return { kind, text: field('text') };
    default:
      throw new ClassificationResultError('The file type could not be identified. Please retry this file.');
  }
}
