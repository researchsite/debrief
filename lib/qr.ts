import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import type { QrProvenance } from './import-types';

let initialized = false;
export async function decodeQrImage(buffer: Buffer): Promise<QrProvenance[]> {
  if (!initialized) {
    // Avoid importing the binary as a JS/WASM module: Turbopack rewrites its
    // low-level imports. The explicit file trace includes it in production.
    const binary = readFileSync(path.join(process.cwd(), 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'));
    prepareZXingModule({ overrides: { wasmBinary: new Uint8Array(binary).buffer } });
    initialized = true;
  }
  const { data, info } = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const results = await readBarcodes({ data: new Uint8ClampedArray(data), width: info.width, height: info.height, colorSpace: 'srgb' }, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 255 });
  return [...new Set(results.map((result) => result.text).filter(Boolean))].map((payload) => ({
    id: createHash('sha256').update(payload).digest('hex'), payload,
  }));
}
