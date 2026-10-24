import { NextResponse } from 'next/server';
import { getCoupons } from '@/lib/graph-writes';

export async function GET() {
  try {
    const coupons = await getCoupons();
    return NextResponse.json({ coupons });
  } catch (err) {
    console.error('[wallet] error:', err);
    return NextResponse.json({ error: 'Wallet unavailable' }, { status: 503 });
  }
}
