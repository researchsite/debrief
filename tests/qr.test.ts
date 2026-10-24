// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeQrImage } from '../lib/qr';
import { parseQrPayload } from '../lib/qr-payload';

const payloads: string[] = JSON.parse(readFileSync(new URL('../fixtures/qr/payloads.json', import.meta.url), 'utf8'));
describe('real QR image decoding', () => {
  it('loads its decoder locally without a CDN request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('External requests disabled'));
    try {
      expect(await decodeQrImage(readFileSync(new URL('../fixtures/qr/single.png', import.meta.url)))).toHaveLength(1);
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
  it.each([
    ['single.png', [0]], ['multiple.png', [0, 1, 2]], ['repeated.png', [0]],
    ['rotated.png', [0, 1]], ['no-code.png', []], ['unreadable.png', []],
  ] as const)('decodes %s without an AI request', async (filename, indices) => {
    const result = await decodeQrImage(readFileSync(new URL(`../fixtures/qr/${filename}`, import.meta.url)));
    expect(result.map((row) => row.payload).sort()).toEqual(indices.map((index) => payloads[index]).sort());
    expect(result.every((row) => /^[a-f0-9]{64}$/.test(row.id))).toBe(true);
  });
  it('parses vCard names, company, email and phone', () => {
    expect(parseQrPayload(payloads[2])).toMatchObject({ kind: 'contact', contact: { name: 'QR Test Contact', company: 'Conference Tools', email: 'qr-test@example.com', phone: '+15555550123' } });
  });
  it('parses MECARD contacts without treating them as URLs', () => {
    expect(parseQrPayload('MECARD:N:Contact,Test;EMAIL:test@example.com;TEL:555;ORG:Tools;;')).toMatchObject({ kind: 'contact', contact: { name: 'Test Contact', email: 'test@example.com', company: 'Tools' } });
  });
  it('keeps non-web actions as text', () => {
    expect(parseQrPayload('WIFI:T:WPA;S:Conference;P:example;;')).toEqual({ kind: 'text' });
    expect(parseQrPayload('javascript:alert(1)')).toEqual({ kind: 'text' });
  });
});
