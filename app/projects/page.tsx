'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Monitor, RefreshCw, Sparkles } from 'lucide-react';
import { PX } from '@/components/pixel';
import { ProjectScene, ProjectScreen } from '@/components/scenes/projects/ProjectScene';
import { useViewMode } from '@/hooks/useViewMode';
import type { HackProject, ProjectAnalysis } from '@/lib/graph-writes';

// ── Types ─────────────────────────────────────────────────────

type Phase = 'idle' | 'fetching' | 'ready' | 'analyzing';

type Slide =
  | { kind: 'input' }
  | { kind: 'loading'; label: string }
  | { kind: 'project'; index: number; total: number; project: HackProject }
  | { kind: 'analysis'; analysis: ProjectAnalysis; total: number }
  | { kind: 'links'; analysis: ProjectAnalysis };

// ── Tag colours ───────────────────────────────────────────────

const TAG_MAP: [string, string][] = [
  ['AI/ML', PX.purple], ['Machine Learning', PX.purple], ['LLM', PX.purple],
  ['Healthcare', PX.teal], ['Health', PX.teal],
  ['FinTech', PX.grass], ['Finance', PX.grass],
  ['Sustainability', PX.leaf], ['CleanTech', PX.leaf],
  ['Education', PX.blue], ['EdTech', PX.blue],
  ['Gaming', PX.orange], ['Game', PX.orange],
  ['Social', PX.pink], ['Community', PX.pink],
  ['Productivity', PX.sky], ['Developer Tools', PX.sky],
  ['Hardware', PX.stone], ['IoT', PX.stone],
  ['Web3', PX.sun], ['Blockchain', PX.sun],
];
function tagColor(t: string): string {
  const lc = t.toLowerCase();
  for (const [k, v] of TAG_MAP) if (lc.includes(k.toLowerCase())) return v;
  return PX.stone;
}
function accent(p: HackProject): string {
  return p.tags?.[0] ? tagColor(p.tags[0]) : PX.purple;
}

// ── Pixel-system slide components ─────────────────────────────

/** Input slide — ticket-booth style using px-panel + px-btn */
function InputSlide({
  url, setUrl, eventName, setEventName, events, sources,
  onScan, onLoadStored, busy,
}: {
  url: string; setUrl: (v: string) => void;
  eventName: string; setEventName: (v: string) => void;
  events: string[]; sources: string[];
  onScan: () => void; onLoadStored: (s: string) => void; busy: boolean;
}) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain p-2 space-y-2">
      {/* Title */}
      <div className="px-panel px-2 py-1.5" style={{ background: PX.purple, borderColor: PX.ink, boxShadow: `3px 3px 0 0 ${PX.ink}` }}>
        <p className="font-pixel text-[8px] tracking-[0.3em]" style={{ color: `${PX.paper}aa` }}>NOW LOADING</p>
        <h2 className="font-pixel text-sm leading-tight" style={{ color: PX.paper }}>HACKATHON PROJECTS</h2>
      </div>

      {/* Event */}
      {events.length > 0 && (
        <div>
          <p className="font-pixel text-[8px] uppercase tracking-widest opacity-50 mb-0.5">Event</p>
          <select value={eventName} onChange={(e) => setEventName(e.target.value)} disabled={busy}
            className="w-full border-4 border-[var(--px-ink)] bg-[var(--px-paper)] px-2 py-1 font-pixel text-[10px] outline-none">
            <option value="">— unlinked —</option>
            {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
          </select>
        </div>
      )}

      {/* Previously scanned */}
      {sources.length > 0 && (
        <div>
          <p className="font-pixel text-[8px] uppercase tracking-widest opacity-50 mb-1">Previously Scanned</p>
          <div className="space-y-1">
            {sources.map((src) => (
              <button key={src} type="button" disabled={busy} onClick={() => { setUrl(src); onLoadStored(src); }}
                className="px-panel w-full flex items-center gap-2 px-2 py-1.5 text-left !border-2 cursor-pointer hover:brightness-95 disabled:opacity-40">
                <RefreshCw size={10} style={{ color: PX.purple, flexShrink: 0 }} />
                <span className="font-pixel text-[9px] truncate min-w-0">
                  {src.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 48)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scan URL */}
      <div>
        <p className="font-pixel text-[8px] uppercase tracking-widest opacity-50 mb-0.5">Scan New Listing</p>
        <div className="flex gap-1.5">
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !busy && onScan()}
            placeholder="https://…/projects/all" disabled={busy}
            className="flex-1 min-w-0 border-4 border-[var(--px-ink)] bg-[var(--px-paper)] px-2 py-1.5 font-pixel text-[10px] outline-none" />
          <button type="button" disabled={busy || !url.trim()} onClick={onScan} className="px-btn shrink-0 text-xs disabled:opacity-40">
            {busy ? '…' : 'SCAN'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Loading slide */
function LoadingSlide({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="px-loader" />
      <p className="font-pixel text-xs">{label}</p>
    </div>
  );
}

/** Project slide — film-poster aesthetic using px-panel, px-chip, px-btn */
function ProjectSlide({ project, index, total }: { project: HackProject; index: number; total: number }) {
  const ac = accent(project);
  const fs = project.name.length > 30 ? 12 : project.name.length > 22 ? 14 : project.name.length > 14 ? 17 : 20;

  return (
    <div className="relative h-full flex flex-col gap-1.5 p-2 overflow-hidden"
      style={{ background: `${ac}09` }}>

      {/* Giant watermark */}
      <div aria-hidden className="pointer-events-none absolute right-0 top-0 select-none font-pixel leading-none"
        style={{ fontSize: 90, color: `${ac}10`, letterSpacing: -6, userSelect: 'none' }}>
        {String(index + 1).padStart(2, '0')}
      </div>

      {/* Row 1: frame badge + tags + link buttons */}
      <div className="relative z-10 flex items-start gap-1 flex-wrap">
        <span className="px-chip text-[9px]"
          style={{ background: ac, color: PX.paper, borderColor: PX.ink }}>
          {String(index + 1).padStart(2, '0')}⁄{total}
        </span>
        {project.tags?.slice(0, 2).map((t, i) => (
          <span key={i} className="px-chip text-[9px]"
            style={{ color: tagColor(t), borderColor: tagColor(t), background: `${tagColor(t)}18` }}>
            {t}
          </span>
        ))}
        <div className="ml-auto flex gap-1 shrink-0">
          {project.demoUrl && (
            <a href={project.demoUrl} target="_blank" rel="noopener noreferrer"
              className="px-btn !py-0 !px-1.5 flex items-center gap-0.5"
              style={{ fontSize: 9, background: PX.grass }}>
              <Monitor size={8} />DEMO
            </a>
          )}
          {project.url && project.url !== project.demoUrl && (
            <a href={project.url} target="_blank" rel="noopener noreferrer"
              className="px-btn !py-0 !px-1.5 flex items-center gap-0.5"
              style={{ fontSize: 9, background: ac }}>
              <ExternalLink size={8} />VIEW
            </a>
          )}
        </div>
      </div>

      {/* Name block — accent-bordered panel */}
      <div className="relative z-10 px-2 py-1.5"
        style={{ border: `3px solid ${ac}`, background: `${ac}15`, boxShadow: `3px 3px 0 0 ${ac}66` }}>
        <h2 className="font-pixel leading-tight" style={{ fontSize: fs, color: PX.ink }}>
          {project.name}
        </h2>
        {project.team && (
          <p className="font-pixel mt-0.5" style={{ fontSize: 9, color: ac }}>▲ {project.team}</p>
        )}
      </div>

      {/* Description — classic px-panel (paper bg, ink border, offset shadow) */}
      {project.description && (
        <div className="relative z-10 flex-1 min-h-0 px-panel px-2 py-1.5">
          <p className="font-pixel-body leading-snug text-[11px]"
            style={{
              color: PX.ink,
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical' as const,
              overflow: 'hidden',
            }}>
            {project.description}
          </p>
        </div>
      )}

      {/* Tech chips — px-chip on paper bg */}
      {project.techStack.length > 0 && (
        <div className="relative z-10 flex flex-wrap items-center gap-1">
          <span className="font-pixel text-[8px] opacity-40">STACK:</span>
          {project.techStack.slice(0, 9).map((t, i) => (
            <span key={i} className="px-chip text-[9px]" style={{ background: PX.paper }}>{t}</span>
          ))}
          {project.techStack.length > 9 && (
            <span className="font-pixel text-[8px] opacity-35">+{project.techStack.length - 9}</span>
          )}
        </div>
      )}
    </div>
  );
}

/** Analysis slide — px-panel sections */
function AnalysisSlide({ analysis, total }: { analysis: ProjectAnalysis; total: number }) {
  return (
    <div className="h-full overflow-y-auto overscroll-contain p-2 space-y-1.5">
      {/* Header */}
      <div className="flex gap-1.5 flex-wrap">
        <span className="px-chip text-[9px]" style={{ background: PX.purple, color: PX.paper, borderColor: PX.ink }}>
          ⎈ AI ANALYSIS
        </span>
        <span className="px-chip text-[9px]">{total} PROJECTS</span>
      </div>

      {/* Summary — px-panel */}
      <div className="px-panel px-2 py-1.5">
        <p className="font-pixel text-[7px] uppercase tracking-widest opacity-45 mb-1">Summary</p>
        <p className="font-pixel-body text-[11px] leading-snug">{analysis.summary}</p>
      </div>

      {/* Common themes — px-panel with grass accent */}
      <div className="px-panel px-2 py-1.5"
        style={{ borderColor: PX.grass, boxShadow: `3px 3px 0 0 ${PX.grass}` }}>
        <p className="font-pixel text-[7px] uppercase tracking-widest mb-1.5" style={{ color: PX.leaf }}>
          Common Themes
        </p>
        <ol className="space-y-1">
          {analysis.common.slice(0, 8).map((c, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="font-pixel text-[8px] w-4 text-right shrink-0 mt-px" style={{ color: PX.grass }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span className="font-pixel-body text-[11px] leading-snug">{c}</span>
            </li>
          ))}
        </ol>
      </div>

      {/* Standouts — px-panel with sun accent */}
      <div className="px-panel px-2 py-1.5"
        style={{ borderColor: PX.sun, boxShadow: `3px 3px 0 0 ${PX.sun}` }}>
        <p className="font-pixel text-[7px] uppercase tracking-widest mb-1.5" style={{ color: PX.orange }}>
          Standouts
        </p>
        <ul className="space-y-1">
          {analysis.unique.slice(0, 6).map((u, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <span className="font-pixel text-[10px] shrink-0" style={{ color: PX.sun }}>★</span>
              <span className="font-pixel-body text-[11px] leading-snug">{u}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Top tech */}
      {analysis.topTech.length > 0 && (
        <div>
          <p className="font-pixel text-[7px] uppercase tracking-widest opacity-45 mb-1">Top Tech</p>
          <div className="flex flex-wrap gap-1">
            {analysis.topTech.slice(0, 14).map((t, i) => (
              <span key={i} className="px-chip text-[9px]"
                style={{ color: PX.purple, borderColor: PX.purple, background: `${PX.purple}18` }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Links slide */
function LinksSlide({ analysis }: { analysis: ProjectAnalysis }) {
  const links = analysis.projectLinks.filter((l) => l.url);
  return (
    <div className="h-full overflow-y-auto overscroll-contain p-2 space-y-1">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="px-chip text-[9px]">{links.length} PROJECT LINKS</span>
      </div>
      {links.map((l, i) => (
        <div key={i} className="px-panel !border-2 flex items-center gap-1.5 px-2 py-1">
          <span className="font-pixel text-[8px] w-5 text-right opacity-30 shrink-0">{i + 1}</span>
          <a href={l.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 min-w-0 flex-1 hover:opacity-70 transition-opacity">
            <span className="font-pixel-body text-xs truncate" style={{ color: PX.purple }}>{l.name}</span>
            <ExternalLink size={10} style={{ color: PX.stone, flexShrink: 0 }} />
          </a>
        </div>
      ))}
    </div>
  );
}

// ── Classic (non-scene) view ──────────────────────────────────

function ClassicProjectsView({
  projects, analysis, url, setUrl, eventName, setEventName, events, sources,
  onScan, onLoadStored, onAnalyze, busy, phase,
}: {
  projects: HackProject[]; analysis: ProjectAnalysis | null;
  url: string; setUrl: (v: string) => void;
  eventName: string; setEventName: (v: string) => void;
  events: string[]; sources: string[];
  onScan: () => void; onLoadStored: (s: string) => void; onAnalyze: () => void;
  busy: boolean; phase: Phase;
}) {
  return (
    <div className="min-h-[calc(100svh-64px)] overflow-y-auto bg-[var(--px-paper)]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[var(--px-paper)] border-b-4 border-[var(--px-ink)] px-4 py-2 flex items-center gap-2 flex-wrap">
        <h1 className="font-pixel text-lg">Hackathon Projects</h1>
        {projects.length > 0 && <span className="px-chip">{projects.length}</span>}
        <div className="ml-auto flex gap-2 items-center">
          {phase === 'ready' && projects.length > 0 && !analysis && (
            <button type="button" className="px-btn !py-0.5 text-xs flex items-center gap-1" onClick={onAnalyze} disabled={busy}>
              <Sparkles size={11} />Analyze
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* Scan form */}
        <div className="px-panel p-3 space-y-2">
          {events.length > 0 && (
            <div className="flex items-center gap-2">
              <label className="font-pixel text-[9px] uppercase tracking-widest opacity-50 shrink-0">Event</label>
              <select value={eventName} onChange={(e) => setEventName(e.target.value)} disabled={busy}
                className="flex-1 border-4 border-[var(--px-ink)] bg-[var(--px-paper)] px-2 py-1 font-pixel text-[10px] outline-none">
                <option value="">— unlinked —</option>
                {events.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && onScan()}
              placeholder="https://…/projects/all" disabled={busy}
              className="flex-1 border-4 border-[var(--px-ink)] bg-white px-2 py-1.5 font-pixel text-[10px] outline-none" />
            <button type="button" disabled={busy || !url.trim()} onClick={onScan} className="px-btn text-xs disabled:opacity-40">
              {busy ? '…' : 'SCAN'}
            </button>
          </div>
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sources.map((src) => (
                <button key={src} type="button" disabled={busy}
                  onClick={() => { setUrl(src); onLoadStored(src); }}
                  className="px-chip cursor-pointer hover:brightness-95 disabled:opacity-40 text-[9px]">
                  <RefreshCw size={9} className="mr-1" />
                  {src.replace(/^https?:\/\//, '').slice(0, 30)}…
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Analysis */}
        {analysis && (
          <div className="px-panel p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-chip text-[9px]" style={{ background: PX.purple, color: PX.paper, borderColor: PX.ink }}>⎈ ANALYSIS</span>
            </div>
            <p className="font-pixel-body text-sm leading-relaxed">{analysis.summary}</p>
            {analysis.topTech.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {analysis.topTech.map((t, i) => (
                  <span key={i} className="px-chip text-[9px]"
                    style={{ color: PX.purple, borderColor: PX.purple, background: `${PX.purple}18` }}>{t}</span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <p className="font-pixel text-[8px] uppercase tracking-widest opacity-40 mb-1">Common Themes</p>
                {analysis.common.slice(0, 6).map((c, i) => (
                  <p key={i} className="font-pixel-body text-xs leading-snug">
                    <span className="font-pixel text-[8px] opacity-40 mr-1">{String(i + 1).padStart(2, '0')}</span>{c}
                  </p>
                ))}
              </div>
              <div>
                <p className="font-pixel text-[8px] uppercase tracking-widest opacity-40 mb-1">Standouts</p>
                {analysis.unique.slice(0, 4).map((u, i) => (
                  <p key={i} className="font-pixel-body text-xs leading-snug">
                    <span className="font-pixel text-[9px] mr-1" style={{ color: PX.sun }}>★</span>{u}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Project cards */}
        {projects.map((p, i) => {
          const ac = accent(p);
          return (
            <div key={i} className="px-panel p-3"
              style={{ borderLeftColor: ac, borderLeftWidth: 6 }}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-pixel text-[8px] opacity-35">{String(i + 1).padStart(2, '0')}</span>
                    <h3 className="font-pixel text-sm leading-tight">{p.name}</h3>
                  </div>
                  {p.team && <p className="font-pixel text-[9px] opacity-50 mt-0.5">▲ {p.team}</p>}
                </div>
                <div className="flex gap-1 shrink-0">
                  {p.tags?.slice(0, 1).map((t, j) => (
                    <span key={j} className="px-chip text-[8px]"
                      style={{ color: tagColor(t), borderColor: tagColor(t), background: `${tagColor(t)}18` }}>{t}</span>
                  ))}
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                      className="px-btn !py-0 !px-1.5 text-[9px]">↗</a>
                  )}
                </div>
              </div>
              {p.description && <p className="font-pixel-body text-xs leading-snug opacity-80 mb-1.5">{p.description}</p>}
              {p.techStack.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {p.techStack.slice(0, 6).map((t, j) => (
                    <span key={j} className="px-chip text-[8px]">{t}</span>
                  ))}
                  {p.techStack.length > 6 && (
                    <span className="font-pixel text-[8px] opacity-35">+{p.techStack.length - 6}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Film Reel Strip ───────────────────────────────────────────

function FilmReelStrip({ slides, currentIdx, onSelect }: {
  slides: Slide[]; currentIdx: number; onSelect: (i: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const frame = el.querySelector<HTMLElement>(`[data-fi="${currentIdx}"]`);
    if (!frame) return;
    el.scrollTo({ left: frame.offsetLeft - el.clientWidth / 2 + frame.offsetWidth / 2, behavior: 'smooth' });
  }, [currentIdx]);

  const reelItems = slides
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.kind === 'project' || s.kind === 'analysis' || s.kind === 'links');
  if (reelItems.length < 2) return null;

  return (
    <div className="absolute inset-x-0 z-20" style={{ top: '71.8%', height: '6.5%', background: '#0e0b21', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Sprocket top */}
      <div className="absolute inset-x-0 top-0 h-1.5 flex items-center gap-1.5 px-0.5 pointer-events-none overflow-hidden">
        {Array.from({ length: 40 }, (_, k) => <div key={k} className="shrink-0 rounded-sm" style={{ width: 7, height: 4, background: '#1c1540' }} />)}
      </div>

      <div ref={scrollRef} className="flex gap-1 h-full items-center overflow-x-auto px-2"
        style={{ paddingTop: 6, paddingBottom: 6, scrollbarWidth: 'none' }}>
        {reelItems.map(({ s, i }) => {
          const isActive = i === currentIdx;
          const ac: string = s.kind === 'project' ? accent(s.project) : PX.purple;
          const num = s.kind === 'project' ? String(s.index + 1).padStart(2, '0') : s.kind === 'analysis' ? '⎈' : '≡';
          const lbl = s.kind === 'project'
            ? (s.project.name.length > 11 ? s.project.name.slice(0, 10) + '…' : s.project.name)
            : s.kind === 'analysis' ? 'Analysis' : 'Links';
          return (
            <button key={i} type="button" data-fi={i} onClick={() => onSelect(i)}
              className="shrink-0 flex flex-col items-center justify-center gap-px rounded-none transition-all duration-150"
              style={{
                width: 40, minHeight: '80%',
                background: isActive ? `${ac}28` : 'rgba(255,255,255,0.04)',
                border: `2px solid ${isActive ? ac : 'rgba(255,255,255,0.06)'}`,
                boxShadow: isActive ? `0 0 8px ${ac}55, inset 0 0 4px ${ac}22` : 'none',
              }}>
              <span className="font-pixel leading-none" style={{ fontSize: 8, color: isActive ? ac : 'rgba(255,255,255,0.3)' }}>{num}</span>
              <span className="font-pixel-body leading-none text-center w-full px-0.5 truncate"
                style={{ fontSize: 7, color: isActive ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.22)' }}>{lbl}</span>
            </button>
          );
        })}
      </div>

      {/* Sprocket bottom */}
      <div className="absolute inset-x-0 bottom-0 h-1.5 flex items-center gap-1.5 px-0.5 pointer-events-none overflow-hidden">
        {Array.from({ length: 40 }, (_, k) => <div key={k} className="shrink-0 rounded-sm" style={{ width: 7, height: 4, background: '#1c1540' }} />)}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────

export default function ProjectsPage() {
  const { classic, toggle } = useViewMode();
  const [url, setUrl] = useState('');
  const [eventName, setEventName] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [projects, setProjects] = useState<HackProject[]>([]);
  const [analysis, setAnalysis] = useState<ProjectAnalysis | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [error, setError] = useState('');
  const [fetcherUsed, setFetcherUsed] = useState<string | null>(null);
  const [pagesScanned, setPagesScanned] = useState(0);

  useEffect(() => {
    fetch('/api/event')
      .then((r) => r.json())
      .then((d: { ok: boolean; events?: { name: string }[] }) => {
        if (d.ok) setEvents((d.events ?? []).map((e) => e.name));
      })
      .catch(() => { /* non-fatal */ });
    fetch('/api/projects/sources')
      .then((r) => r.json())
      .then((d: { ok: boolean; sources?: string[] }) => { if (d.ok) setSources(d.sources ?? []); })
      .catch(() => { /* non-fatal */ });
  }, []);

  // Slide deck
  const slides: Slide[] = [];
  if (phase === 'idle') {
    slides.push({ kind: 'input' });
  } else if (phase === 'fetching') {
    slides.push({ kind: 'loading', label: 'Scanning projects…' });
  } else if (phase === 'analyzing') {
    projects.forEach((p, i) => slides.push({ kind: 'project', index: i, total: projects.length, project: p }));
    slides.push({ kind: 'loading', label: 'Analyzing…' });
  } else {
    slides.push({ kind: 'input' });
    projects.forEach((p, i) => slides.push({ kind: 'project', index: i, total: projects.length, project: p }));
    if (analysis) {
      slides.push({ kind: 'analysis', analysis, total: projects.length });
      if (analysis.projectLinks.some((l) => l.url)) slides.push({ kind: 'links', analysis });
    }
  }

  const clamped = Math.max(0, Math.min(slideIdx, slides.length - 1));
  const slide = slides[clamped] ?? { kind: 'input' as const };
  const canPrev = clamped > 0;
  const canNext = clamped < slides.length - 1;
  function go(dir: 1 | -1) { setSlideIdx((i) => Math.max(0, Math.min(i + dir, slides.length - 1))); }

  async function loadStored(src: string) {
    setError(''); setPhase('fetching'); setProjects([]); setAnalysis(null); setSlideIdx(0);
    try {
      const [projRes, anaRes] = await Promise.all([
        fetch(`/api/projects?src=${encodeURIComponent(src)}`).then((r) => r.json()) as Promise<{ ok: boolean; projects?: HackProject[] }>,
        fetch(`/api/projects/analyze?src=${encodeURIComponent(src)}`).then((r) => r.json()).catch(() => ({ ok: false })) as Promise<{ ok: boolean; analysis?: ProjectAnalysis }>,
      ]);
      if (!projRes.ok) throw new Error('Load failed');
      setProjects(projRes.projects ?? []);
      if (anaRes.ok && anaRes.analysis) setAnalysis(anaRes.analysis);
      setFetcherUsed('graph'); setPagesScanned(0); setPhase('ready'); setSlideIdx(1);
    } catch (err) { setError(err instanceof Error ? err.message : 'Load failed'); setPhase('idle'); }
  }

  async function handleScan() {
    if (!url.trim()) return;
    setError(''); setPhase('fetching'); setProjects([]); setAnalysis(null); setSlideIdx(0);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), eventName: eventName || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; projects?: HackProject[]; fetcher?: string; pages?: number; error?: string };
      if (!data.ok) throw new Error(data.error ?? 'Scan failed');
      setProjects(data.projects ?? []); setFetcherUsed(data.fetcher ?? null);
      setPagesScanned(data.pages ?? 1); setPhase('ready'); setSlideIdx(1);
      fetch('/api/projects/sources').then((r) => r.json())
        .then((d: { ok: boolean; sources?: string[] }) => { if (d.ok) setSources(d.sources ?? []); })
        .catch(() => { /* non-fatal */ });
    } catch (err) { setError(err instanceof Error ? err.message : 'Scan failed'); setPhase('idle'); }
  }

  async function handleAnalyze() {
    setPhase('analyzing'); setError(''); setSlideIdx(projects.length);
    try {
      const res = await fetch('/api/projects/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ src: url.trim(), eventName: eventName || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; analysis?: ProjectAnalysis; error?: string };
      if (!data.ok) throw new Error(data.error ?? 'Analysis failed');
      setAnalysis(data.analysis ?? null); setPhase('ready'); setSlideIdx(projects.length + 1);
    } catch (err) { setError(err instanceof Error ? err.message : 'Analysis failed'); setPhase('ready'); setSlideIdx(1); }
  }

  const busy = phase === 'fetching' || phase === 'analyzing';
  const scrollSlide = slide.kind === 'analysis' || slide.kind === 'links' || slide.kind === 'input';

  // ── Classic mode ──
  if (classic) {
    return (
      <div className="relative">
        <button type="button" onClick={toggle}
          className="px-chip absolute top-2 right-2 z-50 bg-[var(--px-paper)] text-[var(--px-ink)] !py-0.5 cursor-pointer">
          Scene view
        </button>
        <ClassicProjectsView
          projects={projects} analysis={analysis}
          url={url} setUrl={setUrl} eventName={eventName} setEventName={setEventName}
          events={events} sources={sources}
          onScan={() => void handleScan()} onLoadStored={(s) => void loadStored(s)}
          onAnalyze={() => void handleAnalyze()}
          busy={busy} phase={phase}
        />
        {error && <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-panel px-3 py-2 text-xs" style={{ color: PX.red, borderColor: PX.red }}>{error}</div>}
      </div>
    );
  }

  // ── Scene mode ──
  const screenLabel =
    slide.kind === 'project' ? `${slide.index + 1} of ${slide.total}` :
    slide.kind === 'analysis' ? 'analysis' :
    slide.kind === 'links' ? 'all links' :
    slide.kind === 'loading' ? '…' : 'project explorer';

  return (
    <ProjectScene>
      {/* View toggle */}
      <button type="button" onClick={toggle}
        className="px-chip absolute top-2 right-2 z-50 bg-[var(--px-paper)] text-[var(--px-ink)] !py-0.5 cursor-pointer">
        Classic
      </button>

      {/* Progress bar */}
      {slides.length > 1 && (
        <div className="absolute inset-x-0 z-30" style={{ top: '70.8%', height: 2 }}>
          <div className="h-full transition-all duration-300"
            style={{ width: `${slides.length <= 1 ? 100 : Math.round((clamped / (slides.length - 1)) * 100)}%`, background: `linear-gradient(90deg, ${PX.purple}, ${PX.sky})` }} />
        </div>
      )}

      <ProjectScreen label={screenLabel} scroll={scrollSlide}>
        {slide.kind === 'input' && (
          <InputSlide url={url} setUrl={setUrl} eventName={eventName} setEventName={setEventName}
            events={events} sources={sources}
            onScan={() => void handleScan()} onLoadStored={(s) => void loadStored(s)} busy={busy} />
        )}
        {slide.kind === 'loading' && <LoadingSlide label={slide.label} />}
        {slide.kind === 'project' && <ProjectSlide project={slide.project} index={slide.index} total={slide.total} />}
        {slide.kind === 'analysis' && <AnalysisSlide analysis={slide.analysis} total={slide.total} />}
        {slide.kind === 'links' && <LinksSlide analysis={slide.analysis} />}
      </ProjectScreen>

      <FilmReelStrip slides={slides} currentIdx={clamped} onSelect={setSlideIdx} />

      {/* Controls */}
      <div className="absolute inset-x-0 z-20 flex items-center justify-between px-4 pointer-events-none" style={{ bottom: '4%' }}>
        <button type="button" className="px-btn pointer-events-auto !px-3 !py-1 disabled:opacity-20"
          onClick={() => go(-1)} disabled={!canPrev} aria-label="Previous">◀</button>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {phase === 'ready' && projects.length > 0 && !analysis && (
            <button type="button" className="px-btn flex items-center gap-1 text-xs" onClick={() => void handleAnalyze()}>
              <Sparkles size={11} />Analyze
            </button>
          )}
          {fetcherUsed && (
            <span className="px-chip text-[7px]" style={{
              background: fetcherUsed === 'brightdata' ? `${PX.grass}22` : fetcherUsed === 'graph' ? `${PX.sky}22` : `${PX.sun}22`,
              color: fetcherUsed === 'brightdata' ? PX.leaf : fetcherUsed === 'graph' ? PX.blue : PX.orange,
              borderColor: fetcherUsed === 'brightdata' ? `${PX.grass}66` : fetcherUsed === 'graph' ? `${PX.sky}66` : `${PX.sun}66`,
            }}>
              {fetcherUsed === 'brightdata' ? `BD${pagesScanned > 1 ? `×${pagesScanned}` : '✓'}` : fetcherUsed === 'graph' ? 'GRAPH✓' : 'PLAIN'}
            </span>
          )}
        </div>

        <button type="button" className="px-btn pointer-events-auto !px-3 !py-1 disabled:opacity-20"
          onClick={() => go(1)} disabled={!canNext} aria-label="Next">▶</button>
      </div>

      {error && (
        <div className="absolute left-1/2 z-40 -translate-x-1/2 px-panel px-3 py-2 text-xs max-w-[80vw] text-center" style={{ bottom: '14%', color: PX.red, borderColor: PX.red }}>{error}</div>
      )}
    </ProjectScene>
  );
}
