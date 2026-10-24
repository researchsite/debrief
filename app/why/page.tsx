'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ForceGraph from '@/components/ForceGraph';
import type { GraphPath, FollowUpDraft } from '@/lib/graph-writes';

interface RecapData {
  followUps: (FollowUpDraft & { status: string })[];
}

function WhyContent() {
  const searchParams = useSearchParams();
  const name = searchParams.get('name') ?? '';

  const [path, setPath] = useState<GraphPath | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!name) {
      // Use a microtask to avoid setting state synchronously in the effect body
      Promise.resolve().then(() => {
        setLoading(false);
        setError('No person name provided');
      }).catch(() => undefined);
      return;
    }

    let cancelled = false;

    async function fetchAll() {
      try {
        const [pathRes, recapRes] = await Promise.all([
          fetch(`/api/why?name=${encodeURIComponent(name)}`),
          fetch('/api/recap'),
        ]);
        const [pathData, recapData] = await Promise.all([
          pathRes.json() as Promise<{ path?: GraphPath; error?: string }>,
          recapRes.json() as Promise<RecapData>,
        ]);
        if (cancelled) return;
        if (pathData.error) {
          setError(pathData.error);
        } else {
          setPath(pathData.path ?? null);
        }
        const fu = recapData.followUps?.find((f) => f.personName === name);
        if (fu) setFollowUp(fu.message);
      } catch {
        if (!cancelled) setError('Failed to load relationship path');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [name]);

  async function handleCopy() {
    if (!followUp) return;
    try {
      await navigator.clipboard.writeText(followUp);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="px-4 py-6 space-y-5 max-w-[420px] mx-auto">
      <h1 className="text-xl font-bold tracking-tight">
        Why{name ? ` ${name}` : '?'}
      </h1>

      {loading && (
        <div className="rounded-xl border border-border p-6 animate-pulse space-y-2">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-4 w-1/2 rounded bg-muted" />
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {!loading && !error && path && (
        <>
          {path.nodes.length === 0 ? (
            <div className="rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Relationship not yet in graph.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden bg-white">
              <ForceGraph
                nodes={path.nodes}
                links={path.links}
                width={380}
                height={400}
              />
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#7c3aed]" /> Me
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#2563eb]" /> Person
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#16a34a]" /> Company
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full bg-[#9ca3af]" /> Other
            </span>
          </div>
        </>
      )}

      {followUp && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-violet-900">Drafted follow-up</h2>
          <p className="text-sm text-violet-800 whitespace-pre-wrap">{followUp}</p>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy message'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function WhyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <WhyContent />
    </Suspense>
  );
}
