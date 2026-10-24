'use client';

import { useEffect, useState, useCallback } from 'react';
import type { ContextBullet, ContextResult } from '@/lib/graph-writes';

interface Note {
  text: string;
  created_at: number;
}

interface Props {
  encodedUrl: string;
  linkedinUrl: string;
  name: string;
  headline: string;
  city: string;
  company: string;
  email?: string;
  phone?: string;
  notes: Note[];
  hasContext: boolean;
  contextSummary: string | null;
  contextBullets: ContextBullet[] | null;
  contextFetchedAt: number | null;
  sources: { url: string; title: string }[];
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function PersonPageClient({
  encodedUrl,
  linkedinUrl,
  name,
  headline,
  city,
  company,
  email,
  phone,
  notes,
  hasContext: initialHasContext,
  contextSummary: initialSummary,
  contextBullets: initialBullets,
  contextFetchedAt: initialFetchedAt,
  sources: initialSources,
}: Props) {
  const [hasContext, setHasContext] = useState(initialHasContext);
  const [contextSummary, setContextSummary] = useState(initialSummary);
  const [contextBullets, setContextBullets] = useState<ContextBullet[] | null>(initialBullets);
  const [contextFetchedAt, setContextFetchedAt] = useState<number | null>(initialFetchedAt);
  const [sources, setSources] = useState(initialSources);
  const [refreshing, setRefreshing] = useState(false);

  const pollContext = useCallback(async () => {
    try {
      const res = await fetch(`/api/person/context?url=${encodeURIComponent(encodedUrl)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { context: ContextResult | null };
      if (data.context) {
        setHasContext(true);
        setContextSummary(data.context.summary);
        setContextBullets(data.context.bullets);
        setContextFetchedAt(data.context.fetched_at);
        setSources(data.context.sources);
      }
    } catch {
      // ignore polling errors
    }
  }, [encodedUrl]);

  // Poll every 5s if context is missing
  useEffect(() => {
    if (hasContext || !linkedinUrl) return;
    const id = setInterval(() => {
      void pollContext();
    }, 5000);
    return () => clearInterval(id);
  }, [hasContext, pollContext, linkedinUrl]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personUrl: linkedinUrl, force: true }),
      });
      // Poll immediately after triggering refresh
      await pollContext();
      window.location.reload();
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="px-4 py-6 space-y-5 max-w-[500px] mx-auto">
      {/* Person header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight">{name}</h1>
        <p className="text-sm text-muted-foreground">{headline}</p>
        {company && <p className="text-sm text-muted-foreground">{company}</p>}
        {email && <p className="text-sm">{email}</p>}
        {phone && <p className="text-sm">{phone}</p>}
        <p className="text-xs text-muted-foreground">{city}</p>
      </div>

      {/* My Notes card */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">My Notes</h2>
        {notes.length === 0 ? (
          <div className="rounded-xl border border-border p-4 bg-white">
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          </div>
        ) : (
          notes.map((n, i) => (
            <div key={i} className="rounded-xl border border-border p-4 bg-white space-y-1">
              <p className="text-sm">{n.text}</p>
              {n.created_at > 0 && (
                <p className="text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
              )}
            </div>
          ))
        )}
      </section>

      {/* Researched Context card */}
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Researched Context <span className="normal-case font-normal">(AI-generated)</span>
        </h2>

        {!hasContext ? (
          <div className="rounded-xl border border-blue-200 p-4 bg-blue-50 space-y-2">
            <p className="text-xs text-blue-600 pt-1">No research saved yet.</p>
            {linkedinUrl && <button type="button" disabled={refreshing} className="text-sm underline" onClick={() => void handleRefresh()}>{refreshing ? 'Researching…' : 'Research this person'}</button>}
          </div>
        ) : (
          <div className="rounded-xl border border-blue-200 p-4 bg-blue-50 space-y-3">
            {contextSummary && (
              <p className="text-sm font-medium text-blue-900">{contextSummary}</p>
            )}

            {contextBullets && contextBullets.length > 0 && (
              <ul className="space-y-1.5 list-none">
                {contextBullets.map((b, i) => (
                  <li key={i} className="text-sm text-blue-800">
                    <span className="mr-1">•</span>
                    {b.text}
                    {b.source_url && (
                      <a
                        href={b.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 text-xs text-blue-500 underline"
                      >
                        [source]
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {sources.length > 0 && (
              <div className="pt-1 space-y-0.5">
                <p className="text-xs font-medium text-blue-700">Sources:</p>
                {sources.map((s, i) => (
                  <a
                    key={i}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-500 underline truncate"
                  >
                    {s.title || s.url}
                  </a>
                ))}
              </div>
            )}

            {contextFetchedAt != null && contextFetchedAt > 0 && (
              <p className="text-xs text-blue-600">Last updated {timeAgo(contextFetchedAt)}</p>
            )}

            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="mt-1 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {refreshing ? 'Refreshing…' : 'Refresh research'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
