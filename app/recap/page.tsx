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
import { useViewMode } from '@/hooks/useViewMode';

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

const AVATAR_HUES = [270, 320, 200, 30, 160, 0, 55, 240];

function PersonAvatar({ name, photo, size = 40 }: { name: string; photo?: string; size?: number }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
  const hue = AVATAR_HUES[name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_HUES.length];
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photo}
      alt={name}
      width={size}
      height={size}
      style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(91,78,148,0.2)' }}
    />
  ) : (
    <div
      aria-hidden
      style={{
        width: size, height: size, borderRadius: '50%',
        background: `hsl(${hue}, 55%, 46%)`,
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 700, letterSpacing: '-0.02em',
        border: '2px solid rgba(91,78,148,0.15)', flexShrink: 0,
      }}
    >
      {initials}
    </div>
  );
}

export default function RecapPage() {
  const { classic, toggle } = useViewMode();
  const [data, setData] = useState<RecapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [peopleFilter, setPeopleFilter] = useState('');
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());

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
      const body = selectedUrls.size > 0 ? { selectedUrls: [...selectedUrls] } : {};
      const res = await fetch('/api/recap/followups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Follow-up generation failed (${res.status})`);
      setData(await loadRecap());
      setSelectedUrls(new Set());
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Follow-up generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function togglePerson(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });
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

  // Toggle button shown on all states
  const ViewToggle = () => (
    <button type="button" onClick={toggle}
      className="px-chip fixed top-2 right-2 z-50 bg-[var(--px-paper)] text-[var(--px-ink)] !py-0.5 cursor-pointer">
      {classic ? 'Scene view' : 'Classic view'}
    </button>
  );

  // Wrapper: classic = plain scroll div, else animated RecapScene
  function Wrap({ children }: { children: React.ReactNode }) {
    if (classic) {
      return (
        <div className="relative min-h-[calc(100svh-64px)] overflow-y-auto bg-[var(--px-paper)] px-4 pt-10 pb-6">
          <ViewToggle />
          {children}
        </div>
      );
    }
    return (
      <RecapScene>
        <div className="relative">
          <ViewToggle />
          {children}
        </div>
      </RecapScene>
    );
  }

  if (loading) {
    return (
      <Wrap>
        <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
          <div className="rcp-loader" />
          <p className="rcp-title text-lg">Remembering your conference...</p>
        </div>
      </Wrap>
    );
  }

  if (!data || loadError) {
    return (
      <Wrap>
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="rcp-title text-xl text-[#d93648]">Hmm, I can&apos;t recall...</p>
          <p className="text-sm text-[color:var(--rcp-muted)]">Could not load recap data.</p>
          <button type="button" className="rcp-btn mt-3" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </Wrap>
    );
  }

  const { counts, event, people, ideas, followUps } = data;
  const primaryIntent = event?.primaryIntent ?? 'networking';
  const ideaGroups = groupIdeasByTopic(ideas);
  const pf = peopleFilter.trim().toLowerCase();
  const allFiltered = pf
    ? people.filter((p) => p.name.toLowerCase().includes(pf) || (p.company ?? '').toLowerCase().includes(pf))
    : people;
  const primaryPeople = allFiltered.filter((p) => p.intentMatch);
  const otherPeople = allFiltered.filter((p) => !p.intentMatch);

  return (
    <Wrap>
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

        {/* Face gallery — quick visual reference; dedup by name in case someone has two nodes */}
        {people.length > 0 && (() => {
          const seenNames = new Set<string>();
          const uniqueFaces = people.filter((p) => { if (seenNames.has(p.name)) return false; seenNames.add(p.name); return true; });
          return (
            <section className="rcp-card p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <SectionTitle>Faces to Remember</SectionTitle>
                <span className="rcp-chip bg-[#e9e4ff] text-[color:var(--rcp-purple-deep)]">{uniqueFaces.length}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {uniqueFaces.map((person, i) => (
                  <Link
                    key={i}
                    href={`/person/${encodedUrl(person.linkedinUrl)}`}
                    title={`${person.name}${person.company ? ` · ${person.company}` : ''}`}
                    className="group relative"
                  >
                    <PersonAvatar name={person.name} photo={person.photoUrl || undefined} size={44} />
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#1b1530] px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                      {person.name}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Intent card */}
        <section className="rcp-card space-y-3 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <SectionTitle>{intentLabel(primaryIntent)}</SectionTitle>
            <span className="rcp-chip bg-[#fff1c2] text-[#6b4a00]">
              {allFiltered.length}{pf ? ` of ${people.length}` : ''} people
            </span>
          </div>

          <input
            type="search"
            placeholder="Filter by name or company…"
            value={peopleFilter}
            onChange={(e) => setPeopleFilter(e.target.value)}
            className="w-full rounded-lg border border-[color:var(--rcp-border)] bg-white px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[color:var(--rcp-purple)]"
          />

          {allFiltered.length === 0 && (
            <p className="text-sm text-[color:var(--rcp-muted)]">{pf ? 'No matches.' : 'No people found yet.'}</p>
          )}

          {selectedUrls.size > 0 && (
            <p className="text-xs text-[color:var(--rcp-purple)]">
              {selectedUrls.size} selected for follow-up
            </p>
          )}

          {primaryPeople.length > 0 && (
            <ul className="space-y-2">
              {primaryPeople.map((person, i) => {
                const isChecked = selectedUrls.has(person.linkedinUrl);
                return (
                  <li key={i} className={`rcp-item space-y-1 p-2.5 sm:p-3 cursor-pointer transition-colors ${isChecked ? 'ring-2 ring-[color:var(--rcp-purple)]' : ''}`}
                    onClick={() => togglePerson(person.linkedinUrl)}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <input type="checkbox" checked={isChecked} readOnly
                          className="h-4 w-4 shrink-0 accent-[color:var(--rcp-purple)]" />
                        <PersonAvatar name={person.name} photo={person.photoUrl || undefined} size={36} />
                        <div className="min-w-0">
                          <Link href={`/person/${encodedUrl(person.linkedinUrl)}`}
                            className="rcp-link text-[0.95rem]"
                            onClick={(e) => e.stopPropagation()}>
                            {person.name}
                          </Link>
                          <p className="truncate text-xs text-[color:var(--rcp-muted)]">{person.company}</p>
                        </div>
                      </div>
                      <WhyLink name={person.name} />
                    </div>
                    {person.noteText && (
                      <p className="line-clamp-2 text-sm leading-snug text-[#4a4270]">{person.noteText}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {otherPeople.length > 0 && (
            <details className="group">
              <summary className="flex cursor-pointer items-center gap-2 py-1 text-xs font-semibold uppercase tracking-wide text-[color:var(--rcp-muted)] hover:text-[color:var(--rcp-purple)]">
                <span className="flex-1">Also met ({otherPeople.length})</span>
                <span className="group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <ul className="mt-2 space-y-2">
                {otherPeople.map((person, i) => {
                  const isChecked = selectedUrls.has(person.linkedinUrl);
                  return (
                    <li key={i} className={`rcp-item space-y-1 p-2.5 sm:p-3 opacity-80 cursor-pointer ${isChecked ? 'ring-2 ring-[color:var(--rcp-purple)] opacity-100' : ''}`}
                      onClick={() => togglePerson(person.linkedinUrl)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <input type="checkbox" checked={isChecked} readOnly
                            className="h-4 w-4 shrink-0 accent-[color:var(--rcp-purple)]" />
                          <div className="min-w-0">
                            <Link href={`/person/${encodedUrl(person.linkedinUrl)}`}
                              className="rcp-link text-[0.95rem]"
                              onClick={(e) => e.stopPropagation()}>
                              {person.name}
                            </Link>
                            <p className="truncate text-xs text-[color:var(--rcp-muted)]">{person.company}</p>
                          </div>
                        </div>
                        <WhyLink name={person.name} />
                      </div>
                      {person.noteText && (
                        <p className="line-clamp-2 text-sm leading-snug text-[#4a4270]">{person.noteText}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
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
              <div className="flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => void handleGenerateFollowUps()}
                  disabled={generating}
                  className="rcp-btn"
                >
                  <Sparkles aria-hidden className="h-4 w-4" />
                  {selectedUrls.size > 0
                    ? `Generate for ${selectedUrls.size} selected`
                    : followUps.length === 0 ? 'Generate follow-ups' : 'Regenerate all'}
                </button>
                {selectedUrls.size > 0 && (
                  <button type="button" onClick={() => setSelectedUrls(new Set())}
                    className="text-xs text-[color:var(--rcp-muted)] underline">
                    Clear selection
                  </button>
                )}
              </div>
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
    </Wrap>
  );
}
