'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Network, Sparkles } from 'lucide-react';
import type {
  RecapCounts,
  RecapPerson,
  RecapIdea,
  FollowUpDraft,
} from '@/lib/graph-writes';
import { RecapScene } from '@/components/scenes/recap/RecapScene';

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

async function loadRecap(): Promise<RecapData> {
  const res = await fetch('/api/recap');
  if (!res.ok) throw new Error(`Recap request failed (${res.status})`);
  return (await res.json()) as RecapData;
}

function WhyLink({ name }: { name: string }) {
  return (
    <Link
      href={`/why?name=${encodeURIComponent(name)}`}
      title="See the graph path behind this connection"
      className="rcp-why"
    >
      <Network aria-hidden className="h-3.5 w-3.5" strokeWidth={2.5} />
      Why?
    </Link>
  );
}

const STAT_STYLES = [
  { bg: 'linear-gradient(160deg, #ffe58a 0%, #ffc72c 100%)', fg: '#3a2a00' },
  { bg: 'linear-gradient(160deg, #ffa8cf 0%, #ff6aa8 100%)', fg: '#4a0d2b' },
  { bg: 'linear-gradient(160deg, #7ee8dc 0%, #1fb8aa 100%)', fg: '#06362f' },
];

function Stat({ value, label, idx }: { value: number; label: string; idx: number }) {
  const style = STAT_STYLES[idx % STAT_STYLES.length];
  return (
    <div className="rcp-stat px-1 py-3 sm:py-4 text-center" style={{ background: style.bg, color: style.fg }}>
      <p className="rcp-stat-value text-3xl sm:text-5xl">{value}</p>
      <p className="mt-1 text-xs sm:text-sm font-semibold opacity-80">{label}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="rcp-title text-base sm:text-lg">{children}</h2>;
}

export default function RecapPage() {
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setData(await loadRecap());
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }
    void fetchData();
  }, []);

  async function handleGenerateFollowUps() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch('/api/recap/followups', { method: 'POST' });
      if (!res.ok) throw new Error(`Follow-up generation failed (${res.status})`);
      // Refresh recap data to pick up new follow-ups
      setData(await loadRecap());
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Follow-up generation failed');
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
      <RecapScene>
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <div className="rcp-loader" />
          <p className="rcp-title text-lg">Remembering your conference...</p>
        </div>
      </RecapScene>
    );
  }

  if (!data || loadError) {
    return (
      <RecapScene>
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="rcp-title text-xl text-[#d93648]">Hmm, I can&apos;t recall...</p>
          <p className="text-sm text-[color:var(--rcp-muted)]">Could not load recap data.</p>
          <button type="button" className="rcp-btn mt-3" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </RecapScene>
    );
  }

  const { counts, event, people, ideas, followUps } = data;
  const primaryIntent = event?.primaryIntent ?? 'networking';
  const ideaGroups = groupIdeasByTopic(ideas);

  return (
    <RecapScene>
      <div className="space-y-4 sm:space-y-5">
        {/* Header */}
        <header className="space-y-1">
          <p className="rcp-eyebrow">Thinking back on...</p>
          <h1 className="rcp-title text-xl sm:text-3xl">
            {event?.eventName ?? 'Event'} - Your Recap
          </h1>
        </header>

        {/* Counts */}
        <section className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <Stat value={counts.peopleMet} label="people met" idx={0} />
            <Stat value={counts.sessionsSaw} label="sessions" idx={1} />
            <Stat value={counts.ideas} label="ideas" idx={2} />
          </div>
          {counts.connectedAndMet > 0 && (
            <p className="rounded-full bg-[#f1ebff] px-3 py-1.5 text-center text-sm font-medium text-[color:var(--rcp-purple-deep)]">
              {counts.connectedAndMet} connection{counts.connectedAndMet !== 1 ? 's' : ''} became real meetings
            </p>
          )}
        </section>

        {/* Intent card */}
        <section className="rcp-card space-y-3 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>{intentLabel(primaryIntent)}</SectionTitle>
            <span className="rcp-chip bg-[#fff1c2] text-[#6b4a00]">
              {people.length} people
            </span>
          </div>

          {people.length === 0 ? (
            <p className="text-sm text-[color:var(--rcp-muted)]">No people found for this intent yet.</p>
          ) : (
            <ul className="space-y-2">
              {people.map((person, i) => (
                <li key={i} className="rcp-item space-y-1 p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link href={`/person/${encodedUrl(person.linkedinUrl)}`} className="rcp-link text-[0.95rem]">
                        {person.name}
                      </Link>
                      <p className="truncate text-xs text-[color:var(--rcp-muted)]">{person.company}</p>
                    </div>
                    <WhyLink name={person.name} />
                  </div>
                  {person.noteText && (
                    <p className="line-clamp-2 text-sm leading-snug text-[#4a4270]">{person.noteText}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ideas by topic */}
        {ideas.length > 0 && (
          <section className="rcp-card space-y-3 p-3 sm:p-4">
            <SectionTitle>Ideas Captured</SectionTitle>
            {Array.from(ideaGroups.entries()).map(([topic, topicIdeas]) => (
              <div key={topic} className="space-y-2">
                <h3 className="rcp-eyebrow">{topic}</h3>
                <ul className="space-y-2">
                  {topicIdeas.map((idea, i) => (
                    <li key={i} className="rcp-item rcp-item--warm p-2.5 sm:p-3">
                      <p className="text-sm leading-snug">{idea.text}</p>
                      <p className="mt-0.5 text-xs italic text-[#8a6a45]">{idea.sessionTitle}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* Follow-ups */}
        <section className="rcp-card space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>Follow-ups</SectionTitle>
            {!generating && (
              <button
                type="button"
                onClick={() => void handleGenerateFollowUps()}
                disabled={generating}
                className="rcp-btn"
              >
                <Sparkles aria-hidden className="h-4 w-4" />
                {followUps.length === 0 ? 'Generate follow-ups' : 'Regenerate'}
              </button>
            )}
          </div>

          {generating && (
            <div className="flex items-center gap-3 py-2">
              <div className="rcp-loader rcp-loader--sm" />
              <p className="text-sm font-medium">Drafting follow-ups...</p>
            </div>
          )}

          {generateError && !generating && (
            <p role="alert" className="rounded-xl border border-[#ffc2c8] bg-[#fff0f1] px-3 py-2 text-sm text-[#c42b3d]">
              {generateError}. Try again.
            </p>
          )}

          {!generating && followUps.length === 0 && (
            <p className="text-sm leading-snug text-[color:var(--rcp-muted)]">
              No follow-ups drafted yet. Click &ldquo;Generate follow-ups&rdquo; to create AI-drafted messages.
            </p>
          )}

          {followUps.length > 0 && (
            <ul className="space-y-2">
              {followUps.map((fu, i) => (
                <li key={i} className="rcp-item space-y-2 p-2.5 sm:p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.95rem] font-semibold">{fu.personName}</p>
                      <p className="text-xs text-[color:var(--rcp-muted)]">{fu.company}</p>
                    </div>
                    <WhyLink name={fu.personName} />
                  </div>
                  <p className="whitespace-pre-wrap rounded-xl bg-white px-3 py-2 text-sm leading-relaxed shadow-[inset_0_0_0_1px_rgba(91,78,148,0.1)]">
                    {fu.message}
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleCopy(fu.message, i)}
                    className="rcp-btn rcp-btn--ghost"
                  >
                    {copiedIdx === i ? (
                      <Check aria-hidden className="h-3.5 w-3.5" />
                    ) : (
                      <Copy aria-hidden className="h-3.5 w-3.5" />
                    )}
                    {copiedIdx === i ? 'Copied!' : 'Copy'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </RecapScene>
  );
}
