import { NextRequest, NextResponse } from 'next/server';
import { getContext } from '@/lib/graph-writes';

// GET /api/person/context?url=<base64-encoded linkedin_url>
export async function GET(req: NextRequest): Promise<NextResponse> {
  const encoded = req.nextUrl.searchParams.get('url');
  if (!encoded) {
    return NextResponse.json({ context: null });
  }

  let linkedinUrl: string;
  try {
    linkedinUrl = Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return NextResponse.json({ context: null });
  }

  const context = await getContext(linkedinUrl, 'debrief');
  return NextResponse.json({ context });
}
