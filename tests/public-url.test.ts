// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn(async (host: string) => [{ address: host === 'internal.example' ? '192.168.1.10' : '93.184.215.14' }]) }));
import { publicHttpUrl } from '../lib/public-url';
describe('QR public destination validation', () => {
  it.each(['http://localhost/secret', 'http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/', 'http://internal.example/', 'file:///etc/passwd', 'javascript:alert(1)', 'https://user:password@example.com/'])('does not fetch %s', async (url) => {
    await expect(publicHttpUrl(url)).rejects.toThrow();
  });
  it('accepts an ordinary public page', async () => { expect(await publicHttpUrl('https://example.com/offer')).toBe('https://example.com/offer'); });
});
