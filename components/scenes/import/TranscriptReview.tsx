'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ReviewItem } from '@/app/api/transcripts/route';
import { PX } from '@/components/pixel';
import { CONVERSATION_CATEGORIES, transcriptPersonUrl, transcriptPersonName } from '@/lib/transcript-result';
import { PxButton } from './PxButton';

const MUTED = 'text-[#5b5478]';

interface Choice {
  personUrl: string;
  personName: string;
  skip: boolean;
  confirmed: boolean;
  isPrivate: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function confidenceColor(value: number): string {
  if (value >= 0.7) return PX.grass;
  if (value >= 0.4) return PX.sun;
  return PX.red;
}

/** Reviews the conversations extracted from one .vtt transcript and saves the confirmed ones. */
export function TranscriptReview({ filename, items, onDismiss }: { filename: string; items: ReviewItem[]; onDismiss: () => void }) {
  const [choices, setChoices] = useState<Record<number, Choice>>(() => Object.fromEntries(items.map((item, i) => [item.index, {
    personUrl: item.candidates[0]?.linkedinUrl ?? transcriptPersonUrl(item.extraction.who.name, filename, i),
    personName: transcriptPersonName(item.extraction.who.name, i),
    skip: false,
    confirmed: false,
    isPrivate: true,
  }])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ count: number; people: { name: string; url: string }[] } | null>(null);

  const update = (index: number, patch: Partial<Choice>) => setChoices((prev) => ({ ...prev, [index]: { ...prev[index], ...patch } }));
  const selectPerson = (item: ReviewItem, value: string, itemIndex: number) => {
    if (value === '__new__') update(item.index, { personUrl: transcriptPersonUrl(item.extraction.who.name, filename, itemIndex), personName: transcriptPersonName(item.extraction.who.name, itemIndex) });
    else update(item.index, { personUrl: value, personName: item.candidates.find((c) => c.linkedinUrl === value)?.name ?? choices[item.index].personName });
  };
  const allActioned = items.every((item) => choices[item.index]?.confirmed || choices[item.index]?.skip);

  const saveAll = async () => {
    const confirms = items.map((item, i) => {
      const choice = choices[item.index];
      return {
        index: item.index,
        personUrl: choice?.personUrl ?? transcriptPersonUrl(item.extraction.who.name, filename, i),
        personName: choice?.personName ?? transcriptPersonName(item.extraction.who.name, i),
        starts: item.starts,
        ends: item.ends,
        extraction: item.extraction,
        skip: choice?.skip ?? false,
        isPrivate: choice?.isPrivate ?? true,
      };
    });
    setSaving(true);
    setError(null);
    try {
      const resp = await fetch('/api/transcripts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, confirms }),
      });
      const data = (await resp.json()) as { ok: boolean; saved?: number; error?: string };
      if (!data.ok) throw new Error(data.error ?? 'Save failed');
      setSaved({
        count: data.saved ?? 0,
        people: confirms.filter((c) => !c.skip).map((c) => ({ name: c.personName, url: `/person/${encodeURIComponent(c.personUrl)}` })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div className="px-panel flex flex-col gap-1 p-3" style={{ background: '#dff7df' }}>
        <p className="font-pixel text-sm" style={{ color: 'var(--px-leaf)' }}>✓ Saved {saved.count} conversation{saved.count !== 1 ? 's' : ''}</p>
        {saved.people.map((person, i) => (
          <Link key={i} href={person.url} className="font-pixel-body text-lg underline">View {person.name} →</Link>
        ))}
      </div>
    );
  }

  return (
    <div className="px-panel">
      <div className="flex items-center justify-between gap-2 border-b-4 border-[var(--px-ink)] px-3 py-2" style={{ background: 'var(--px-pink)' }}>
        <h3 className="font-pixel min-w-0 truncate text-sm sm:text-base">🎙 {filename}</h3>
        <PxButton variant="secondary" size="sm" onClick={onDismiss}>Dismiss</PxButton>
      </div>
      <div className="flex flex-col gap-3 p-3">
        <p className={`font-pixel-body text-lg leading-tight ${MUTED}`}>Found {items.length} conversation{items.length !== 1 ? 's' : ''}</p>
        {items.map((item, itemIndex) => {
          const choice = choices[item.index];
          const { extraction } = item;
          const isUnknown = !extraction.who.name;
          return (
            <div key={item.index} className="flex flex-col gap-2 border-2 border-[var(--px-ink)] bg-white p-2.5" style={{ opacity: choice?.skip ? 0.55 : 1 }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-pixel text-xs">{formatTime(item.starts)} - {formatTime(item.ends)}</span>
                <div className="flex flex-wrap gap-1">
                  <span className="px-chip" style={{ background: 'var(--px-cream)' }}>{CONVERSATION_CATEGORIES[extraction.category] ?? extraction.category}</span>
                  <span className="px-chip" style={{ background: confidenceColor(extraction.confidence) }}>{Math.round(extraction.confidence * 100)}% sure</span>
                </div>
              </div>
              <p className="font-pixel-body line-clamp-3 border-l-4 pl-2 text-base leading-tight" style={{ borderColor: PX.pink }}>
                {item.text.slice(0, 200)}{item.text.length > 200 ? '…' : ''}
              </p>
              <p className="font-pixel-body text-lg leading-tight">
                Talked with <strong>{extraction.who.name || 'Unknown'}</strong>
                {extraction.who.company && <> from <strong>{extraction.who.company}</strong></>}
                {extraction.who.role && <span className={MUTED}> ({extraction.who.role})</span>}
              </p>
              {extraction.summary && <p className={`font-pixel-body text-base leading-tight ${MUTED}`}>{extraction.summary}</p>}
              {extraction.key_points.length > 0 && (
                <div>
                  <p className="font-pixel text-[10px]">Key points</p>
                  <ul className="font-pixel-body text-base leading-tight">
                    {extraction.key_points.map((p, i) => <li key={i}><span aria-hidden>▸ </span><span>{p}</span></li>)}
                  </ul>
                </div>
              )}
              {item.candidates.length > 0 && (
                <label className="font-pixel flex flex-col gap-1 text-[10px]">
                  Match to existing person
                  <select
                    className="font-pixel-body border-2 border-[var(--px-ink)] bg-white px-2 py-1 text-base"
                    value={choice?.personUrl ?? ''}
                    onChange={(e) => selectPerson(item, e.target.value, itemIndex)}
                  >
                    {item.candidates.map((c) => <option key={c.linkedinUrl} value={c.linkedinUrl}>{c.name} - {c.headline || c.linkedinUrl}</option>)}
                    <option value="__new__">+ New person</option>
                  </select>
                </label>
              )}
              {isUnknown && (
                <Link href="/add-person" className="font-pixel-body text-base underline" style={{ color: PX.blue }}>
                  + Add this person via LinkedIn →
                </Link>
              )}
              {extraction.topics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {extraction.topics.map((t, i) => <span key={i} className="px-chip" style={{ background: 'var(--px-cream)' }}>{t}</span>)}
                </div>
              )}
              {extraction.promises.length > 0 && (
                <div>
                  <p className="font-pixel text-[10px]">Follow-ups</p>
                  <ul className="font-pixel-body text-base leading-tight">
                    {extraction.promises.map((p, i) => <li key={i}><span aria-hidden>▸ </span><span>{p}</span></li>)}
                  </ul>
                </div>
              )}
              <label className="font-pixel flex items-center gap-2 text-[10px]">
                <input
                  type="checkbox"
                  checked={choice?.isPrivate ?? true}
                  onChange={(e) => update(item.index, { isPrivate: e.target.checked })}
                  className="h-3.5 w-3.5"
                />
                Keep private (not visible in shared recap)
              </label>
              {choice?.confirmed ? (
                <p className="font-pixel text-xs" style={{ color: 'var(--px-leaf)' }}>✓ Confirmed</p>
              ) : choice?.skip ? (
                <p className={`font-pixel text-xs ${MUTED}`}>Skipped</p>
              ) : (
                <div className="flex gap-2">
                  <PxButton variant="success" size="sm" className="flex-1" onClick={() => update(item.index, { confirmed: true, skip: false })}>Confirm</PxButton>
                  <PxButton variant="secondary" size="sm" className="flex-1" onClick={() => update(item.index, { skip: true, confirmed: false })}>Skip</PxButton>
                </div>
              )}
            </div>
          );
        })}
        {error && <p role="alert" className="font-pixel-body border-2 border-[var(--px-ink)] px-2 py-1 text-base text-white" style={{ background: 'var(--px-red)' }}>{error}</p>}
        <PxButton className="w-full" disabled={!allActioned || saving} onClick={saveAll}>
          {saving ? 'Saving…' : 'Save confirmed conversations'}
        </PxButton>
      </div>
    </div>
  );
}
