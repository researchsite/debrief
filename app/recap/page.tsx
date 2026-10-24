'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
      className="px-chip flex-shrink-0 bg-[color:var(--px-purple)] text-white hover:brightness-110"
    >
      Why?
    </Link>
  );
}

const STAT_STYLES = [
  { bg: 'var(--px-sun)', fg: 'var(--px-ink)' },
  { bg: 'var(--px-pink)', fg: 'var(--px-ink)' },
  { bg: 'var(--px-teal)', fg: 'var(--px-ink)' },
];

function Stat({ value, label, idx }: { value: number; label: string; idx: number }) {
  const style = STAT_STYLES[idx % STAT_STYLES.length];
  return (
    <div
      className="px-panel px-1 py-2 text-center"
      style={{ background: style.bg, color: style.fg }}
    >
      <p className="font-pixel text-4xl sm:text-5xl leading-none">{value}</p>
      <p className="font-pixel-body text-base sm:text-lg leading-tight mt-1">{label}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-pixel text-lg sm:text-xl leading-tight">{children}</h2>;
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
          <div className="px-loader" />
          <p className="font-pixel text-lg">Remembering your conference...</p>
        </div>
      </RecapScene>
    );
  }

  if (!data || loadError) {
    return (
      <RecapScene>
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="font-pixel text-xl" style={{ color: 'var(--px-red)' }}>Hmm, I can&apos;t recall...</p>
          <p className="font-pixel-body text-lg">Could not load recap data.</p>
          <button type="button" className="px-btn text-sm mt-2" onClick={() => window.location.reload()}>
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
      <div className="space-y-5">
        {/* Header */}
        <header>
          <p className="font-pixel-body text-base uppercase tracking-wide" style={{ color: 'var(--px-purple)' }}>
            Thinking back on...
          </p>
          <h1 className="font-pixel text-xl sm:text-3xl leading-tight">
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
            <p className="font-pixel-body text-lg text-center border-2 border-dashed px-2" style={{ borderColor: 'var(--px-purple)' }}>
              {counts.connectedAndMet} connection{counts.connectedAndMet !== 1 ? 's' : ''} became real meetings
            </p>
          )}
        </section>

        {/* Intent card */}
        <section className="px-panel p-3 sm:p-4 space-y-3 bg-white">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>{intentLabel(primaryIntent)}</SectionTitle>
            <span className="px-chip" style={{ background: 'var(--px-sun)' }}>
              {people.length} people
            </span>
          </div>

          {people.length === 0 ? (
            <p className="font-pixel-body text-lg">No people found for this intent yet.</p>
          ) : (
            <ul className="space-y-2">
              {people.map((person, i) => (
                <li key={i} className="border-2 p-2 space-y-1" style={{ borderColor: 'var(--px-ink)', background: 'var(--px-paper)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/person/${encodedUrl(person.linkedinUrl)}`}
                        className="font-pixel text-base hover:underline"
                        style={{ color: 'var(--px-blue)' }}
                      >
                        {person.name}
                      </Link>
                      <p className="font-pixel-body text-base leading-tight truncate">{person.company}</p>
                    </div>
                    <WhyLink name={person.name} />
                  </div>
                  {person.noteText && (
                    <p className="font-pixel-body text-base leading-tight line-clamp-2 opacity-80">{person.noteText}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ideas by topic */}
        {ideas.length > 0 && (
          <section className="px-panel p-3 sm:p-4 space-y-3 bg-white">
            <SectionTitle>Ideas Captured</SectionTitle>
            {Array.from(ideaGroups.entries()).map(([topic, topicIdeas]) => (
              <div key={topic} className="space-y-2">
                <h3 className="font-pixel text-xs uppercase tracking-wide" style={{ color: 'var(--px-purple)' }}>
                  {topic}
                </h3>
                <ul className="space-y-2">
                  {topicIdeas.map((idea, i) => (
                    <li key={i} className="border-2 p-2" style={{ borderColor: 'var(--px-ink)', background: 'var(--px-cream)' }}>
                      <p className="font-pixel-body text-lg leading-tight">{idea.text}</p>
                      <p className="font-pixel-body text-base leading-tight italic opacity-75">{idea.sessionTitle}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* Follow-ups */}
        <section className="px-panel p-3 sm:p-4 space-y-3 bg-white">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <SectionTitle>Follow-ups</SectionTitle>
            {!generating && (
              <button
                type="button"
                onClick={() => void handleGenerateFollowUps()}
                disabled={generating}
                className="px-btn text-sm"
              >
                {followUps.length === 0 ? 'Generate follow-ups' : 'Regenerate'}
              </button>
            )}
          </div>

          {generating && (
            <div className="flex items-center gap-3 py-2">
              <div className="px-loader" />
              <p className="font-pixel text-sm">Drafting follow-ups...</p>
            </div>
          )}

          {generateError && !generating && (
            <p role="alert" className="font-pixel-body text-lg border-2 px-2" style={{ borderColor: 'var(--px-red)', color: 'var(--px-red)' }}>
              {generateError}. Try again.
            </p>
          )}

          {!generating && followUps.length === 0 && (
            <p className="font-pixel-body text-lg leading-tight">
              No follow-ups drafted yet. Click &ldquo;Generate follow-ups&rdquo; to create AI-drafted messages.
            </p>
          )}

          {followUps.length > 0 && (
            <ul className="space-y-2">
              {followUps.map((fu, i) => (
                <li key={i} className="border-2 p-2 space-y-2" style={{ borderColor: 'var(--px-ink)', background: 'var(--px-paper)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-pixel text-base">{fu.personName}</p>
                      <p className="font-pixel-body text-base leading-tight">{fu.company}</p>
                    </div>
                    <WhyLink name={fu.personName} />
                  </div>
                  <p className="font-pixel-body text-lg leading-tight whitespace-pre-wrap">{fu.message}</p>
                  <button
                    type="button"
                    onClick={() => void handleCopy(fu.message, i)}
                    className="px-btn text-xs !py-1 !px-3"
                    style={{ background: 'var(--px-sky)' }}
                  >
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
