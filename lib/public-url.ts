import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function privateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value.startsWith('::ffff:')) return privateAddress(value.slice(7));
  if (isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return value === '::' || value === '::1' || /^(fc|fd|fe[89ab])/.test(value);
}
export async function publicHttpUrl(raw: string): Promise<string> {
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Only public web links can be read.');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) throw new Error('Only public web links can be read.');
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error('Only public web links can be read.');
  return url.href;
}
