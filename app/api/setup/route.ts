import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { writeSetup, getSetupData, type SetupInput } from '@/lib/graph-writes';

export async function GET() {
  if (process.env.USE_MOCK_DATA === 'true') {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'fixtures/mock/setup.json'), 'utf8'),
    );
    return NextResponse.json(fixture);
  }

  try {
    const data = await getSetupData('debrief');
    return NextResponse.json({ data });
  } catch (err) {
    console.error('[GET /api/setup]', err);
    return NextResponse.json({ data: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SetupInput;

    if (!body.name || !body.linkedinUrl || !body.eventName) {
      return NextResponse.json(
        { error: 'name, linkedinUrl, and eventName are required' },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.intents) || body.intents.length === 0) {
      return NextResponse.json(
        { error: 'At least one intent is required' },
        { status: 400 },
      );
    }

    if (!body.primaryIntent || !body.intents.includes(body.primaryIntent)) {
      return NextResponse.json(
        { error: 'primaryIntent must be one of the selected intents' },
        { status: 400 },
      );
    }

    await writeSetup(body, 'debrief');
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/setup]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
