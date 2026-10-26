'use client';

import { useState } from 'react';
import type { CouponData } from '@/lib/graph-writes';
import { PX } from '@/components/pixel';

const BAND_COLORS = [PX.red, PX.orange, PX.teal, PX.purple, PX.blue, PX.pink, PX.leaf];

function bandColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return BAND_COLORS[h % BAND_COLORS.length];
}

function expiryInfo(expires: string | null, used: boolean): { text: string; bg: string } {
  if (used) return { text: 'Used', bg: PX.stone };
  if (!expires) return { text: 'No expiry', bg: PX.cream };
  const exp = new Date(expires);
  if (Number.isNaN(exp.getTime())) return { text: `Expires ${expires}`, bg: PX.cream };
  const days = Math.ceil((exp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { text: 'Expired', bg: PX.stone };
  if (days < 7) return { text: `Expires in ${days}d`, bg: PX.sun };
  return { text: `Expires ${exp.toLocaleDateString()}`, bg: PX.cream };
}

export interface CouponTicketProps {
  coupon: CouponData;
  copied: boolean;
  onCopy: (code: string) => void;
  onMarkUsed: (code: string) => void;
  onUpdate: (code: string, patch: { vendor?: string; value?: string; description?: string; expires?: string | null }) => Promise<void>;
}

/** One saved code or offer drawn as a pixel ticket tucked in a wallet slot. */
export function CouponTicket({ coupon, copied, onCopy, onMarkUsed, onUpdate }: CouponTicketProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ vendor: coupon.vendor, value: coupon.value, description: coupon.description, expires: coupon.expires ?? '' });
  const [saving, setSaving] = useState(false);

  const band = bandColor(coupon.vendor || coupon.code);
  const expiry = expiryInfo(coupon.expires, coupon.used);

  async function saveEdit() {
    setSaving(true);
    await onUpdate(coupon.code, { ...draft, expires: draft.expires || null });
    setSaving(false);
    setEditing(false);
  }

  return (
    <article
      className="relative flex w-full max-w-[380px] flex-col overflow-hidden border-4 border-[#1b1530] bg-[#fff7e6] text-[#1b1530]"
      style={{ boxShadow: `4px 4px 0 0 ${PX.ink}` }}
      aria-label={`${coupon.vendor} ${coupon.value}`}
    >
      <header
        className="flex items-center justify-between gap-2 border-b-4 border-[#1b1530] px-3 py-1.5"
        style={{ background: band }}
      >
        <span className="font-pixel truncate text-base font-bold text-white [text-shadow:2px_2px_0_#1b1530]">
          {coupon.vendor || 'Unknown vendor'}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {coupon.value && (
            <span className="px-chip bg-[#ffd23f] text-[#1b1530]">{coupon.value}</span>
          )}
          <button
            type="button"
            className="font-pixel text-[10px] text-white underline"
            onClick={() => { setDraft({ vendor: coupon.vendor, value: coupon.value, description: coupon.description, expires: coupon.expires ?? '' }); setEditing((e) => !e); }}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </div>
      </header>

      {editing ? (
        <div className="flex flex-col gap-2 px-3 pt-2 pb-3">
          {(['vendor', 'value', 'description', 'expires'] as const).map((field) => (
            <label key={field} className="font-pixel flex flex-col gap-0.5 text-[10px] uppercase">
              {field}
              <input
                type="text"
                value={draft[field] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                placeholder={field === 'expires' ? 'YYYY-MM-DD or blank' : `Enter ${field}`}
                className="font-pixel-body border-2 border-[#1b1530] bg-white px-2 py-1 text-base normal-case"
              />
            </label>
          ))}
          <button
            type="button"
            className="px-btn w-full text-xs"
            disabled={saving}
            onClick={() => void saveEdit()}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      ) : (
        <div className={`flex flex-col gap-2 px-3 pt-2 pb-4 ${coupon.used ? 'opacity-55' : ''}`}>
          <div className="flex items-stretch gap-2">
            <div
              className={`font-pixel flex flex-1 items-center justify-center border-2 border-dashed border-[#1b1530] bg-[#ffe9c2] px-2 py-1 text-center text-xl leading-tight font-bold tracking-wider break-all sm:text-2xl ${
                coupon.used ? 'line-through' : ''
              }`}
            >
              {coupon.code}
            </div>
            <button
              type="button"
              className="px-btn shrink-0 !px-2 !py-1 text-xs"
              onClick={() => onCopy(coupon.code)}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>

          {coupon.description && (
            <p className="font-pixel-body line-clamp-2 text-lg leading-tight">{coupon.description}</p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="px-chip" style={{ background: expiry.bg }}>
              {expiry.text}
            </span>
            <div className="flex items-center gap-2">
              {coupon.redeemUrl && /^https?:\/\//i.test(coupon.redeemUrl) && (
                <a
                  href={coupon.redeemUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-pixel text-xs underline decoration-2 underline-offset-2 hover:text-[#8b5cf6]"
                >
                  Redeem
                </a>
              )}
              {!coupon.used && (
                <button
                  type="button"
                  className="px-btn !px-2 !py-0.5 text-xs !bg-[#6bd66b]"
                  onClick={() => onMarkUsed(coupon.code)}
                >
                  Mark used
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {coupon.used && (
        <span
          aria-hidden
          className="font-pixel pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-12 border-4 border-[#ff4f5e] px-3 text-3xl font-bold text-[#ff4f5e] opacity-80"
        >
          USED
        </span>
      )}
    </article>
  );
}
