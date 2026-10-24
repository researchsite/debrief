'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CouponData } from '@/lib/graph-writes';
import { WalletScene, type WalletStatus } from '@/components/scenes/wallet/WalletScene';

export default function WalletPage() {
  const [coupons, setCoupons] = useState<CouponData[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<WalletStatus>('loading');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/wallet')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { coupons?: CouponData[] }) => {
        if (cancelled) return;
        setCoupons(data.coupons ?? []);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const handleRetry = useCallback(() => {
    setStatus('loading');
    setReloadKey((k) => k + 1);
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

  const q = search.trim().toLowerCase();
  const filtered = coupons.filter(
    (c) =>
      c.vendor.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q),
  );

  // Sort: non-null expires ASC, then nulls at bottom
  const sorted = [...filtered].sort((a, b) => {
    if (!a.expires && !b.expires) return 0;
    if (!a.expires) return 1;
    if (!b.expires) return -1;
    return new Date(a.expires).getTime() - new Date(b.expires).getTime();
  });

  return (
    <div
      className="flex h-[calc(100svh-64px)] flex-col gap-3 overflow-hidden px-4 pt-4 pb-3 text-[#1b1530]"
      style={{
        backgroundColor: '#8fdcff',
        backgroundImage:
          'repeating-conic-gradient(#7fd3ff 0% 25%, transparent 0% 50%)',
        backgroundSize: '48px 48px',
      }}
    >
      <div className="mx-auto flex w-full max-w-[900px] flex-wrap items-center gap-3">
        <h1 className="font-pixel text-2xl font-bold tracking-wide [text-shadow:2px_2px_0_#fff7e6]">
          Wallet
        </h1>
        {status === 'ready' && coupons.length > 0 && (
          <span className="px-chip bg-[#fff7e6]">
            {coupons.length} saved
          </span>
        )}
        <input
          type="search"
          placeholder="Search by vendor, code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="font-pixel-body min-w-0 flex-1 basis-[220px] border-4 border-[#1b1530] bg-[#fff7e6] px-3 py-1 text-xl outline-none focus-visible:outline-3 focus-visible:outline-dashed focus-visible:outline-[#8b5cf6]"
          aria-label="Search wallet"
        />
      </div>

      <WalletScene
        key={q}
        status={status}
        items={sorted}
        filtered={q.length > 0}
        copiedCode={copiedCode}
        onCopy={handleCopy}
        onMarkUsed={handleMarkUsed}
        onRetry={handleRetry}
      />
    </div>
  );
}
