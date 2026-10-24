import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { prepareZXingModule, writeBarcode } from 'zxing-wasm/writer';

const require = createRequire(import.meta.url);
const binary = readFileSync(require.resolve('zxing-wasm/writer/zxing_writer.wasm'));
prepareZXingModule({ overrides: { wasmBinary: new Uint8Array(binary).buffer } });
const output = new URL('../fixtures/qr/', import.meta.url);
mkdirSync(output, { recursive: true });
const payloads = [
  'https://www.linkedin.com/in/shamhc',
  'https://example.com/conference-offer',
  'BEGIN:VCARD\nVERSION:3.0\nFN:QR Test Contact\nORG:Conference Tools\nTITLE:Engineer\nEMAIL:qr-test@example.com\nTEL:+15555550123\nEND:VCARD',
];
async function qr(payload, rotate = 0) {
  const result = await writeBarcode(payload, { format: 'QRCode', scale: 6, addQuietZones: true });
  if (result.error) throw new Error(result.error);
  return sharp(Buffer.from(result.svg)).resize(320, 320).rotate(rotate, { background: '#fff' }).png().toBuffer();
}
async function canvas(name, entries, heading) {
  const width = Math.max(720, entries.length * 360);
  const overlays = await Promise.all(entries.map(async ([payload, angle], index) => ({ input: await qr(payload, angle), left: index * 360 + 20, top: 100 })));
  if (heading) overlays.push({ input: Buffer.from(`<svg width="${width}" height="80"><text x="20" y="50" font-size="30">Conference QR links and notes</text></svg>`), left: 0, top: 0 });
  await sharp({ create: { width, height: 500, channels: 4, background: '#fff' } }).composite(overlays).png().toFile(new URL(name, output).pathname);
}
await canvas('single.png', [[payloads[0], 0]]);
await canvas('multiple.png', [[payloads[0], 0], [payloads[1], 0], [payloads[2], 0]], true);
await canvas('repeated.png', [[payloads[0], 0], [payloads[0], 0]]);
await canvas('rotated.png', [[payloads[0], 90], [payloads[1], 180]]);
await canvas('no-code.png', [], true);
// A code with its detection patterns obscured is intentionally unreadable.
await sharp(await qr(payloads[0])).composite([{ input: Buffer.from('<svg width="320" height="240"><rect width="320" height="240" fill="white"/></svg>'), top: 0, left: 0 }]).png().toFile(new URL('unreadable.png', output).pathname);
writeFileSync(new URL('payloads.json', output), JSON.stringify(payloads, null, 2) + '\n');
console.log('Generated six QR fixture images.');
