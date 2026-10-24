'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  RecapCounts,
  RecapPerson,
  RecapIdea,
  FollowUpDraft,
} from '@/lib/graph-writes';

interface RecapData {
  counts: RecapCounts;
  event: { eventName: string; primaryIntent: string } | null;
  people: RecapPerson[];
  ideas: RecapIdea[];
  followUps: (FollowUpDraft & { status: string })[];
}

const INTENT_LABELS: Record<string, string> = {
  job_hunt: 'Job Hunting',
  learning: 'Learning',
  networking: 'Networking',
  hiring: 'Hiring',
  partnerships: 'Partnerships',
};

function intentLabel(intent: string): string {
  return INTENT_LABELS[intent] ?? intent.replace(/_/g, ' ');
}

function encodedUrl(raw: string): string {
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

function groupIdeasByTopic(ideas: RecapIdea[]): Map<string, RecapIdea[]> {
  const map = new Map<string, RecapIdea[]>();
  for (const idea of ideas) {
    const topics = idea.topics.length > 0 ? idea.topics : ['General'];
    for (const topic of topics) {
      const key = topic;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(idea);
    }
  }
  return map;
}

export default function RecapPage() {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/recap');
        const json = (await res.json()) as RecapData;
        setData(json);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    }
    void fetchData();
  }, []);

  async function handleGenerateFollowUps() {
    setGenerating(true);
    try {
      await fetch('/api/recap/followups', { method: 'POST' });
      // Refresh recap data to pick up new follow-ups
      const res = await fetch('/api/recap');
      const json = (await res.json()) as RecapData;
      setData(json);
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-4 max-w-[420px] mx-auto animate-pulse">
        <div className="h-6 w-1/2 rounded bg-muted" />
        <div className="rounded-xl h-32 bg-muted" />
        <div className="rounded-xl h-48 bg-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-sm text-muted-foreground">Could not load recap data.</p>
      </div>
    );
  }

  const { counts, event, people, ideas, followUps } = data;
  const primaryIntent = event?.primaryIntent ?? 'networking';
  const ideaGroups = groupIdeasByTopic(ideas);

  return (
    <div className="pb-6 max-w-[420px] mx-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">{event?.eventName ?? 'Event Recap'}</p>
        <h1 className="text-lg font-bold tracking-tight">Your Recap</h1>
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Card 1: Counts */}
        <section className="rounded-2xl border border-border bg-white p-5 space-y-3">
          <div className="text-center space-y-1">
            <p className="text-5xl font-black text-violet-600">{counts.peopleMet}</p>
            <p className="text-base font-semibold text-foreground">people met</p>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{counts.sessionsSaw}</p>
              <p className="text-xs text-muted-foreground mt-0.5">sessions attended</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-2xl font-bold text-foreground">{counts.ideas}</p>
              <p className="text-xs text-muted-foreground mt-0.5">ideas captured</p>
            </div>
          </div>
          {counts.connectedAndMet > 0 && (
            <div className="rounded-xl bg-violet-50 border border-violet-200 p-3 text-center">
              <p className="text-sm font-semibold text-violet-800">
                {counts.connectedAndMet} connection{counts.connectedAndMet !== 1 ? 's' : ''} became real meetings
              </p>
            </div>
          )}
        </section>

        {/* Card 2: Intent card */}
        <section className="rounded-2xl border border-border bg-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">{intentLabel(primaryIntent)}</h2>
            <span className="text-xs bg-violet-100 text-violet-700 rounded-full px-2 py-0.5 font-medium">
              {people.length} people
            </span>
          </div>

          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No people found for this intent yet.</p>
          ) : (
            <ul className="space-y-3">
              {people.map((person, i) => (
                <li key={i} className="rounded-xl border border-border p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/person/${encodedUrl(person.linkedinUrl)}`}
                        className="text-sm font-semibold text-blue-700 hover:underline"
                      >
                        {person.name}
                      </Link>
                      <p className="text-xs text-muted-foreground truncate">{person.company}</p>
                    </div>
                    <Link
                      href={`/why?name=${encodeURIComponent(person.name)}`}
                      className="flex-shrink-0 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 transition-colors"
                    >
                      Why?
                    </Link>
                  </div>
                  {person.noteText && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{person.noteText}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Card 3: Ideas by topic */}
        {ideas.length > 0 && (
          <section className="rounded-2xl border border-border bg-white p-5 space-y-4">
            <h2 className="text-base font-bold">Ideas Captured</h2>
            {Array.from(ideaGroups.entries()).map(([topic, topicIdeas]) => (
              <div key={topic} className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {topic}
                </h3>
                <ul className="space-y-2">
                  {topicIdeas.map((idea, i) => (
                    <li key={i} className="rounded-xl bg-amber-50 border border-amber-100 p-3 space-y-1">
                      <p className="text-sm">{idea.text}</p>
                      <p className="text-xs text-muted-foreground italic">{idea.sessionTitle}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* Card 4: Follow-ups */}
        <section className="rounded-2xl border border-border bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">Follow-ups</h2>
            {followUps.length === 0 && (
              <button
                type="button"
                onClick={() => void handleGenerateFollowUps()}
                disabled={generating}
                className="rounded-lg bg-violet-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {generating ? 'Generating…' : 'Generate follow-ups'}
              </button>
            )}
          </div>

          {generating && (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map((n) => (
                <div key={n} className="rounded-xl h-20 bg-muted" />
              ))}
            </div>
          )}

          {!generating && followUps.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No follow-ups drafted yet. Click &ldquo;Generate follow-ups&rdquo; to create AI-drafted messages.
            </p>
          )}

          {followUps.length > 0 && (
            <>
              {!generating && (
                <button
                  type="button"
                  onClick={() => void handleGenerateFollowUps()}
                  disabled={generating}
                  className="rounded-lg border border-violet-200 text-violet-700 px-3 py-1.5 text-xs font-medium hover:bg-violet-50 transition-colors"
                >
                  Regenerate
                </button>
              )}
              <ul className="space-y-3">
                {followUps.map((fu, i) => (
                  <li key={i} className="rounded-xl border border-border p-3 space-y-2">
                    <div>
                      <p className="text-sm font-semibold">{fu.personName}</p>
                      <p className="text-xs text-muted-foreground">{fu.company}</p>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{fu.message}</p>
                    <button
                      type="button"
                      onClick={() => void handleCopy(fu.message, i)}
                      className="rounded-lg border border-border bg-muted/50 px-3 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      {copiedIdx === i ? 'Copied!' : 'Copy'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
