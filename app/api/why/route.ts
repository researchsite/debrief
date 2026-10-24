import { NextRequest, NextResponse } from 'next/server';
import { getWhyPath, type GraphPath } from '@/lib/graph-writes';

interface WhyResponse {
  path?: GraphPath;
  error?: string;
}

export async function GET(req: NextRequest): Promise<NextResponse<WhyResponse>> {
  const name = req.nextUrl.searchParams.get('name');
  if (!name) {
    return NextResponse.json({ error: 'name query param is required' }, { status: 400 });
  }

  try {
    const path = await getWhyPath(name, 'debrief');
    return NextResponse.json({ path });
  } catch (err) {
    console.error('[GET /api/why]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
