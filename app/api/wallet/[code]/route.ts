import { NextRequest, NextResponse } from 'next/server';
import { markCouponUsed } from '@/lib/graph-writes';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const body = await request.json() as { used?: boolean };

    if (body.used === true) {
      await markCouponUsed(decodeURIComponent(code));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[wallet/used] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 },
    );
  }
}
