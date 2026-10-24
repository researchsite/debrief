'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ReviewItem } from '@/app/api/transcripts/route';
import Link from 'next/link';
import { CONVERSATION_CATEGORIES, normalizeConversationExtraction, transcriptPersonName, transcriptPersonUrl } from '@/lib/transcript-result';

type PageState = 'upload' | 'analyzing' | 'review' | 'done';

interface ConfirmState {
  [index: number]: {
    personUrl: string;
    personName: string;
    skip: boolean;
    confirmed: boolean;
  };
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function ConfidencePill({ value }: { value: number }) {
  let className = 'text-xs px-2 py-0.5 rounded-full font-medium ';
  let label = '';

  if (value >= 0.7) {
    className += 'bg-green-100 text-green-800';
    label = `${Math.round(value * 100)}% confident`;
  } else if (value >= 0.4) {
    className += 'bg-yellow-100 text-yellow-800';
    label = `${Math.round(value * 100)}% confident`;
  } else {
    className += 'bg-red-100 text-red-800';
    label = `${Math.round(value * 100)}% confident`;
  }

  return <span className={className}>{label}</span>;
}

export default function TranscriptImportPage() {
  const [pageState, setPageState] = useState<PageState>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [filename, setFilename] = useState('');
  const [confirmState, setConfirmState] = useState<ConfirmState>({});
  const [savedCount, setSavedCount] = useState(0);
  const [savedPeople, setSavedPeople] = useState<{ name: string; url: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ignoredCount, setIgnoredCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) { setFile(selected); setError(null); }
  };

  const handleAnalyze = async () => {
    if (!file) return;
    setError(null);
    setPageState('analyzing');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const resp = await fetch('/api/transcripts', { method: 'POST', body: formData });
      const data = (await resp.json()) as { ok: boolean; items?: ReviewItem[]; filename?: string; error?: string; ignoredCount?: number };

      if (!data.ok || !data.items) {
        setError(data.error ?? 'Failed to analyze transcript');
        setPageState('upload');
        return;
      }

      const items = data.items.map((item) => ({ ...item, extraction: normalizeConversationExtraction(item.extraction) }));
      const importedFilename = data.filename ?? file.name;
      setReviewItems(items);
      setFilename(importedFilename);
      setIgnoredCount(data.ignoredCount ?? 0);

      // Initialize confirm state
      const initial: ConfirmState = {};
      for (const item of items) {
        const topCandidate = item.candidates[0];
        initial[item.index] = {
          personUrl: topCandidate?.linkedinUrl || transcriptPersonUrl(item.extraction.who.name, importedFilename, item.index),
          personName: topCandidate?.name || transcriptPersonName(item.extraction.who.name, item.index),
          skip: false,
          confirmed: false,
        };
      }
      setConfirmState(initial);
      setPageState('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setPageState('upload');
    }
  };

  const handleConfirm = (index: number) => {
    setConfirmState((prev) => ({ ...prev, [index]: { ...prev[index], confirmed: true, skip: false } }));
  };

  const handleSkip = (index: number) => {
    setConfirmState((prev) => ({ ...prev, [index]: { ...prev[index], skip: true, confirmed: false } }));
  };

  const handlePersonSelect = (index: number, value: string, items: ReviewItem[]) => {
    const item = items.find((i) => i.index === index);
    if (!item) return;

    if (value === '__new__') {
      setConfirmState((prev) => ({
        ...prev,
        [index]: {
          ...prev[index],
          personUrl: transcriptPersonUrl(item.extraction.who.name, filename, item.index),
          personName: transcriptPersonName(item.extraction.who.name, item.index),
          confirmed: false,
        },
      }));
    } else {
      const candidate = item.candidates.find((c) => c.linkedinUrl === value);
      setConfirmState((prev) => ({
        ...prev,
        [index]: {
          ...prev[index],
          personUrl: value,
          personName: candidate?.name ?? prev[index].personName,
          confirmed: false,
        },
      }));
    }
  };

  const handleSaveAll = async () => {
    if (saving || !reviewItems.some((item) => confirmState[item.index]?.confirmed)) return;
    setSaving(true);
    setError(null);
    const confirms = reviewItems.map((item) => {
      const state = confirmState[item.index];
      return {
        index: item.index,
        personUrl: state?.personUrl ?? `placeholder:${item.index}`,
        personName: state?.personName ?? item.extraction.who.name,
        starts: item.starts,
        ends: item.ends,
        extraction: item.extraction,
        skip: !state?.confirmed || state.skip,
      };
    });

    try {
      const resp = await fetch('/api/transcripts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, confirms }),
      });
      const data = (await resp.json()) as { ok: boolean; saved?: number; error?: string };

      if (data.ok) {
        setSavedCount(data.saved ?? 0);
        // Build saved people list from confirmed items
        const people = confirms
          .filter((c) => !c.skip)
          .map((c) => ({ name: c.personName, url: `/person/${encodeURIComponent(c.personUrl)}` }));
        setSavedPeople(people);
        setPageState('done');
      } else {
        setError(data.error ?? 'Save failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  // State 1: Upload
  if (pageState === 'upload') {
    return (
      <div className="flex flex-col px-4 pt-8 pb-4 gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-1">Import Transcript</h1>
          <p className="text-muted-foreground text-sm">
            Upload a .vtt file to extract conversations and save them to your memory graph
          </p>
        </div>

        <Card>
          <CardContent className="pt-4 pb-4 flex flex-col gap-4">
            <div
              className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/60 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-4xl">🎙</div>
              <p className="text-sm text-muted-foreground text-center">
                Tap to select a .vtt file
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".vtt"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {file && (
              <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-sm truncate flex-1">{file.name}</span>
                <button
                  onClick={() => setFile(null)}
                  className="text-muted-foreground hover:text-destructive text-lg leading-none"
                >
                  ×
                </button>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
              Audio files (m4a/mp3) are not yet supported — use .vtt from Zoom cloud recording
            </p>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>

        <Button className="w-full" disabled={!file} onClick={handleAnalyze}>
          Analyze
        </Button>
      </div>
    );
  }

  // State 2: Analyzing
  if (pageState === 'analyzing') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-6">
        <div className="text-4xl animate-pulse">🔍</div>
        <h2 className="text-xl font-semibold text-center">Splitting and extracting conversations…</h2>
        <div className="w-full max-w-xs bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full animate-pulse w-2/3" />
        </div>
      </div>
    );
  }

  // State 3: Review list
  if (pageState === 'review') {
    const allActioned = reviewItems.every(
      (item) => confirmState[item.index]?.confirmed || confirmState[item.index]?.skip,
    );

    return (
      <div className="flex flex-col px-4 pt-6 pb-4 gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Review Conversations</h1>
          <Button variant="outline" size="sm" onClick={() => setPageState('upload')}>
            Back
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Found {reviewItems.length} conversation{reviewItems.length !== 1 ? 's' : ''} in {filename}
        </p>
        {ignoredCount > 0 && (
          <p className="text-sm text-muted-foreground">Ignored {ignoredCount} segment{ignoredCount !== 1 ? 's' : ''} containing only noise or small talk.</p>
        )}
        {reviewItems.length === 0 && (
          <p className="text-sm text-muted-foreground">No substantive conversations found. Try a transcript containing useful discussion, decisions, or commitments.</p>
        )}

        {reviewItems.map((item) => {
          const state = confirmState[item.index];
          const isConfirmed = state?.confirmed;
          const isSkipped = state?.skip;
          const { extraction } = item;

          return (
            <Card
              key={item.index}
              className={
                isConfirmed
                  ? 'border-green-500/50'
                  : isSkipped
                    ? 'opacity-50'
                    : ''
              }
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {formatTime(item.starts)} – {formatTime(item.ends)}
                  </CardTitle>
                  <ConfidencePill value={extraction.confidence} />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Badge variant="secondary" className="self-start">{CONVERSATION_CATEGORIES[extraction.category]}</Badge>
                {/* Extracted person info */}
                <p className="text-sm">
                  Talked with{' '}
                  <strong>{extraction.who.name || 'Unknown'}</strong>
                  {extraction.who.company && (
                    <>
                      {' '}from <strong>{extraction.who.company}</strong>
                    </>
                  )}
                  {extraction.who.role && (
                    <span className="text-muted-foreground"> ({extraction.who.role})</span>
                  )}
                </p>

                {/* Summary */}
                <p className="text-sm text-muted-foreground">{extraction.summary}</p>
                {extraction.key_points.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Key points</p>
                    <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                      {extraction.key_points.map((point, index) => <li key={index}>{point}</li>)}
                    </ul>
                  </div>
                )}
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer">Transcript excerpt</summary>
                  <p className="mt-2 bg-muted/50 rounded-lg px-3 py-2 whitespace-pre-wrap font-mono leading-relaxed">
                    {item.text}
                  </p>
                </details>

                {/* Candidate picker */}
                {item.candidates.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Match to existing person</label>
                    <select
                      className="w-full text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                      value={item.candidates.some((candidate) => candidate.linkedinUrl === state?.personUrl) ? state?.personUrl : '__new__'}
                      onChange={(e) => handlePersonSelect(item.index, e.target.value, reviewItems)}
                    >
                      {item.candidates.map((c) => (
                        <option key={c.linkedinUrl} value={c.linkedinUrl}>
                          {c.name} — {c.headline || c.linkedinUrl}
                        </option>
                      ))}
                      <option value="__new__">+ New person</option>
                    </select>
                  </div>
                )}

                {/* Topics */}
                {extraction.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {extraction.topics.map((t, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Promises */}
                {extraction.promises.length > 0 && (
                  <div>
                    <p className="text-xs font-medium mb-1">Promises / follow-ups</p>
                    <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                      {extraction.promises.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Action buttons */}
                {!isConfirmed && !isSkipped && (
                  <div className="flex gap-2 mt-1">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                      size="sm"
                      onClick={() => handleConfirm(item.index)}
                    >
                      Confirm
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      size="sm"
                      onClick={() => handleSkip(item.index)}
                    >
                      Skip
                    </Button>
                  </div>
                )}

                {isConfirmed && (
                  <p className="text-xs text-green-600 font-medium">Confirmed</p>
                )}
                {isSkipped && (
                  <p className="text-xs text-muted-foreground">Skipped</p>
                )}
              </CardContent>
            </Card>
          );
        })}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          className="w-full"
          disabled={saving || !allActioned || !reviewItems.some((item) => confirmState[item.index]?.confirmed)}
          onClick={handleSaveAll}
        >
          {saving ? 'Saving…' : 'Save confirmed conversations'}
        </Button>
      </div>
    );
  }

  // State 4: Done
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-6 text-center">
      <div className="text-5xl">✓</div>
      <h2 className="text-xl font-semibold">Saved {savedCount} conversation{savedCount !== 1 ? 's' : ''}</h2>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {savedPeople.map((person, i) => (
          <Link
            key={i}
            href={person.url}
            className="text-sm text-primary underline"
          >
            View {person.name}
          </Link>
        ))}
      </div>
      <Link href="/import" className="text-sm text-muted-foreground underline mt-4">
        Back to Import
      </Link>
    </div>
  );
}
