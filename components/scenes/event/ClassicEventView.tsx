'use client';

import { useState } from 'react';
import type { EventData, ExtractedSession } from './useEventData';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function ScoreDots({ score }: { score: number }) {
  const dots = Math.min(score, 10);
  return (
    <span className="flex gap-0.5 items-center" aria-label={`Score ${score}`}>
      {Array.from({ length: Math.max(dots, 1) }).map((_, i) => {
        let color = 'bg-gray-300';
        if (score >= 4) color = 'bg-green-500';
        else if (score >= 2) color = 'bg-yellow-400';
        return <span key={i} className={`inline-block w-2 h-2 rounded-full ${color}`} />;
      })}
      <span className="ml-1 text-xs text-muted-foreground font-mono">{score}</span>
    </span>
  );
}

function ReasonBadges({ reasons }: { reasons: string[] }) {
  const shown = reasons.slice(0, 3);
  const extra = reasons.length - 3;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {shown.map((r, i) => (
        <span
          key={i}
          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
        >
          {r}
        </span>
      ))}
      {extra > 0 && (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          +{extra} more
        </span>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: ExtractedSession }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="w-full text-left px-4 py-3 space-y-0.5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium text-sm leading-snug">{session.title}</p>
          <span className="text-muted-foreground text-sm shrink-0">{open ? '▲' : '▼'}</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {session.starts}{session.ends ? ` – ${session.ends}` : ''}
          {session.room ? ` · ${session.room}` : ''}
        </p>
        {(session.speakers ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground">
            {(session.speakers ?? []).map((s) => `${s.name}${s.company ? `, ${s.company}` : ''}`).join(' · ')}
          </p>
        )}
      </button>
      {open && session.abstract && (
        <div className="px-4 pb-3 border-t border-border bg-muted/20">
          <p className="text-sm text-foreground mt-2 leading-relaxed">{session.abstract}</p>
        </div>
      )}
    </div>
  );
}

// Group sessions by start time
function groupByTime(sessions: ExtractedSession[]): Map<string, ExtractedSession[]> {
  const map = new Map<string, ExtractedSession[]>();
  for (const s of sessions) {
    const key = s.starts || 'Unscheduled';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return map;
}

// ────────────────────────────────────────────────────────────
// Classic list view (demo safety net)
// ────────────────────────────────────────────────────────────

export function ClassicEventView({ data }: { data: EventData }) {
  const {
    url, setUrl, loading, refreshing, error, extraction, meetPlan, metSet,
    storedEventUrl, lastRefreshed, loadError, handleRefresh, handleImport, handleMet,
  } = data;

  const timeGroups = extraction ? groupByTime(extraction.sessions) : null;

  return (
    <div className="px-4 py-6 space-y-6 max-w-[480px] mx-auto pb-24">
      {/* ── Section 1: URL import ── */}
      <div className="space-y-3">
        <h1 className="text-xl font-bold tracking-tight">Import Event</h1>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !loading && handleImport()}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://event-site.com/schedule"
            disabled={loading}
          />
          <button
            type="button"
            onClick={handleImport}
            disabled={loading}
            className="shrink-0 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
          >
            {loading ? '…' : 'Import'}
          </button>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Fetching event…
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {loadError && !extraction && <p className="text-sm text-destructive">Could not load stored event: {loadError}</p>}
      </div>

      {/* ── Section 2: Agenda ── */}
      {extraction && (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">{extraction.event.name}</h2>
              <p className="text-xs text-muted-foreground">
                {extraction.event.date}
                {extraction.event.venue ? ` · ${extraction.event.venue}` : ''}
              </p>
              {lastRefreshed && (
                <p className="text-xs text-muted-foreground">
                  Updated {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            {storedEventUrl && (
              <button
                type="button"
                onClick={() => handleRefresh()}
                disabled={refreshing}
                className="shrink-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 transition-colors"
              >
                {refreshing ? (
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Refreshing…
                  </span>
                ) : (
                  'Refresh schedule'
                )}
              </button>
            )}
          </div>

          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Agenda</h3>

          {timeGroups && Array.from(timeGroups.entries()).map(([time, sessions]) => (
            <div key={time} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground pl-1">{time}</p>
              {sessions.map((s, i) => (
                <SessionCard key={`${time}-${i}`} session={s} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* ── Section 3: Meet Plan ── */}
      {meetPlan.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Who to meet</h2>
          <div className="space-y-3">
            {meetPlan.map((person) => {
              const hasMet = metSet.has(person.linkedinUrl);
              return (
                <div
                  key={person.linkedinUrl}
                  className="rounded-xl border border-border bg-card px-4 py-3 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm leading-snug">{person.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {person.company ?? person.headline}
                      </p>
                    </div>
                    <ScoreDots score={person.score} />
                  </div>

                  {person.reasons.length > 0 && <ReasonBadges reasons={person.reasons} />}

                  {person.opener && (
                    <p className="text-sm text-muted-foreground italic">&ldquo;{person.opener}&rdquo;</p>
                  )}

                  {person.sessionTitle && (
                    <p className="text-xs text-muted-foreground">
                      Speaks at: <span className="font-medium">{person.sessionTitle}</span>
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => !hasMet && handleMet(person.linkedinUrl)}
                    disabled={hasMet}
                    className={`mt-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      hasMet
                        ? 'bg-green-100 text-green-700 cursor-default'
                        : 'bg-muted hover:bg-muted/80 text-foreground'
                    }`}
                  >
                    {hasMet ? 'Met ✓' : 'Met them ✓'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
