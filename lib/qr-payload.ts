import type { ClassifiedBadge } from './classify';

export type QrPayload = { kind: 'linkedin' | 'url'; url: string } | { kind: 'contact'; contact: ClassifiedBadge } | { kind: 'text' };

export function parseQrPayload(payload: string): QrPayload {
  const raw = payload.trim();
  if (/^BEGIN:VCARD/i.test(raw) || /^MECARD:/i.test(raw)) {
    const mecard = /^MECARD:/i.test(raw);
    const lines = mecard ? raw.slice(7).split(/(?<!\\);/) : raw.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const fields: Record<string, string> = {};
    for (const line of lines) {
      const colon = line.indexOf(':');
      if (colon < 0) continue;
      const key = line.slice(0, colon).split(';')[0].toUpperCase();
      if (!fields[key]) fields[key] = line.slice(colon + 1).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
    }
    const name = fields.FN || (fields.N ? fields.N.split(mecard ? ',' : ';').slice(0, 2).reverse().filter(Boolean).join(' ') : '');
    if (name) return { kind: 'contact', contact: { kind: 'business_card', name, company: fields.ORG?.split(';')[0] || '', title: fields.TITLE || '', email: fields.EMAIL || '', phone: fields.TEL || '', linkedin_url: fields.URL && isLinkedIn(fields.URL) ? fields.URL : '' } };
  }
  try {
    const url = new URL(raw);
    if (['http:', 'https:'].includes(url.protocol)) return { kind: isLinkedIn(raw) ? 'linkedin' : 'url', url: url.href };
  } catch { /* Other payloads remain decoded text. */ }
  return { kind: 'text' };
}
function isLinkedIn(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) && /^\/in\/[^/]+\/?$/.test(url.pathname);
  } catch { return false; }
}
