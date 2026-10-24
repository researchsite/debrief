import { NextRequest, NextResponse } from 'next/server';
import { resolveQrPayload } from '@/lib/qr-resolve';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (typeof body?.payload !== 'string' || !body.payload || body.payload.length > 32768) return NextResponse.json({ error: 'A valid QR payload is required.' }, { status: 400 });
    return NextResponse.json({ ok: true, item: await resolveQrPayload(body.payload) });
  } catch {
    return NextResponse.json({ error: 'Could not read this QR code. Please retry.' }, { status: 400 });
  }
}
