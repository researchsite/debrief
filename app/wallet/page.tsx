'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { CouponData } from '@/lib/graph-writes';
import Link from 'next/link';

function getExpiryColor(expires: string | null, used: boolean): string {
  if (used) return 'text-muted-foreground line-through';
  if (!expires) return 'text-muted-foreground';
  const exp = new Date(expires);
  const now = new Date();
  const diff = exp.getTime() - now.getTime();
  const days = diff / (1000 * 60 * 60 * 24);
  if (days < 0) return 'text-muted-foreground'; // expired
  if (days < 7) return 'text-amber-500 font-medium';
  return 'text-muted-foreground';
}

function ExpiryLabel({ expires, used }: { expires: string | null; used: boolean }) {
  if (!expires) return <span className="text-xs text-muted-foreground">No expiry</span>;
  const exp = new Date(expires);
  const now = new Date();
  const diff = exp.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  const color = getExpiryColor(expires, used);

  if (used) return <span className={`text-xs ${color}`}>Used</span>;
  if (days < 0) return <span className="text-xs text-muted-foreground">Expired</span>;
  if (days < 7) return <span className={`text-xs ${color}`}>Expires in {days}d</span>;
  return <span className="text-xs text-muted-foreground">Expires {exp.toLocaleDateString()}</span>;
}

export default function WalletPage() {
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/wallet')
      .then((r) => r.json())
      .then((data: { coupons?: CouponData[] }) => {
        setCoupons(data.coupons ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleMarkUsed = useCallback(async (code: string) => {
    await fetch(`/api/wallet/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ used: true }),
    });
    setCoupons((prev) => prev.map((c) => (c.code === code ? { ...c, used: true } : c)));
  }, []);

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }, []);

  const filtered = coupons.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.vendor.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  });

  // Sort: non-null expires ASC, then nulls at bottom
  const sorted = [...filtered].sort((a, b) => {
    if (!a.expires && !b.expires) return 0;
    if (!a.expires) return 1;
    if (!b.expires) return -1;
    return new Date(a.expires).getTime() - new Date(b.expires).getTime();
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground text-sm">Loading wallet…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col px-4 pt-6 pb-4 gap-4">
      <h1 className="text-2xl font-semibold">Wallet</h1>

      <Input
        placeholder="Search by vendor, code…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full"
      />

      {sorted.length === 0 && (
        <div className="flex flex-col items-center gap-3 pt-12 text-center">
          <p className="text-muted-foreground text-sm">
            No coupons yet. Import a coupon screenshot to get started.
          </p>
          <Link href="/import">
            <Button variant="outline">Go to Import</Button>
          </Link>
        </div>
      )}

      {sorted.map((coupon) => (
        <Card key={coupon.code} className={coupon.used ? 'opacity-50' : ''}>
          <CardContent className="pt-4 pb-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lg">{coupon.vendor}</span>
              <Badge variant="secondary">{coupon.value}</Badge>
            </div>

            <div className="flex items-center gap-2">
              <div className="font-mono text-base font-bold tracking-wider bg-muted/60 rounded-lg px-3 py-1 flex-1 text-center">
                {coupon.code}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(coupon.code)}
                className="shrink-0"
              >
                {copiedCode === coupon.code ? '✓ Copied' : 'Copy'}
              </Button>
            </div>

            {coupon.description && (
              <p className="text-sm text-muted-foreground">{coupon.description}</p>
            )}

            <div className="flex items-center justify-between">
              <ExpiryLabel expires={coupon.expires} used={coupon.used} />
              {!coupon.used && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 px-2"
                  onClick={() => handleMarkUsed(coupon.code)}
                >
                  Mark used
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
