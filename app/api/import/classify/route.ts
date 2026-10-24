import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { classifyImage, classifyPdfText, extractPdfText } from '@/lib/classify';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
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

    // Ensure uploads directory exists
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    fs.writeFileSync(filePath, buffer);

    const publicPath = `/uploads/${fileName}`;

    let result;
    if (file.type === 'application/pdf') {
      const text = await extractPdfText(buffer);
      result = await classifyPdfText(text);
    } else {
      const base64 = buffer.toString('base64');
      result = await classifyImage(base64, file.type);
    }

    return NextResponse.json({ ...result, _filePath: publicPath });
  } catch (err) {
    console.error('[classify] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Classification failed' },
      { status: 500 },
    );
  }
}
