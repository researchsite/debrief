import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { classifyImage, classifyPdfText, extractPdfText, type ClassificationResult } from '@/lib/classify';
import { decodeQrImage } from '@/lib/qr';
import { parseQrPayload } from '@/lib/qr-payload';
import type { ImportPreviewItem } from '@/lib/import-types';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Save uploaded file to public/uploads/<uuid>.<ext>
    const ext = file.name.split('.').pop() ?? 'bin';
    const uuid = crypto.randomUUID();
    const fileName = `${uuid}.${ext}`;
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    const filePath = path.join(uploadsDir, fileName);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > 20 * 1024 * 1024) return NextResponse.json({ error: 'Choose a file smaller than 20 MB.' }, { status: 400 });

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);

    const publicPath = `/uploads/${fileName}`;
    const scanOnly = formData.get('scanOnly') === 'true';
    const codes = file.type !== 'application/pdf' ? await decodeQrImage(buffer) : [];
    const items: ImportPreviewItem[] = codes.map((qr) => {
      const parsed = parseQrPayload(qr.payload);
      return { id: qr.id, source: 'qr', qr: { ...qr, ...('url' in parsed ? { url: parsed.url } : {}) }, result: { kind: 'qr', text: qr.payload } };
    });
    if (scanOnly) return NextResponse.json({ kind: 'qr', text: codes.map((code) => code.payload).join('\n'), items, _filePath: publicPath });

    let result: ClassificationResult | undefined;
    let warning;
    try {
      if (file.type === 'application/pdf') {
        const text = await extractPdfText(buffer);
        result = await classifyPdfText(text);
      } else result = await classifyImage(buffer.toString('base64'), file.type);
      if (!codes.length && result.kind === 'qr') return NextResponse.json({ error: 'No readable QR code found. Try a clearer image or crop each QR code.' }, { status: 422 });
      const text = result.kind === 'other' ? result.text.trim() : '';
      const qrOnly = result.kind === 'qr' || (result.kind === 'other' && (!text || codes.some((code) => code.payload.trim() === text) || codes.map((code) => code.payload).join('\n').trim() === text));
      if (!codes.length || !qrOnly) items.unshift({ id: crypto.randomUUID(), source: 'image', result });
    } catch (error) {
      if (!codes.length) throw error;
      warning = 'QR codes were decoded; the rest of the image could not be analyzed.';
    }

    return NextResponse.json({ ...(result ?? items[0].result), items, warning, _filePath: publicPath });
  } catch (err) {
    console.error('[classify] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Classification failed' },
      { status: 500 },
    );
  }
}
