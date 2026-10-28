import { NextRequest, NextResponse } from 'next/server';
import { markCouponUsed, updateCoupon } from '@/lib/graph-writes';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await params;
    const decodedCode = decodeURIComponent(code);
    const body = await request.json() as { used?: boolean; vendor?: string; value?: string; description?: string; expires?: string | null; terms?: string; redeemUrl?: string };

    if (body.used === true) {
      await markCouponUsed(decodedCode);
    }

    const { used: _used, ...patch } = body;
    if (Object.keys(patch).length > 0) {
      await updateCoupon(decodedCode, patch);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[wallet/patch] error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Update failed' },
      { status: 500 },
    );
  }
}
