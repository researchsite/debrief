import { NextRequest, NextResponse } from 'next/server';
import { writeMet } from '@/lib/graph-writes';

interface RequestBody {
  personUrl: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.personUrl) {
    return NextResponse.json({ ok: false, error: 'personUrl is required' }, { status: 400 });
  }

  try {
    await writeMet(body.personUrl, 'debrief');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/event/met]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
