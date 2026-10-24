'use client';

import { useState, useRef } from 'react';

type PageState = 'form' | 'loading' | 'result';

interface ApiResponse {
  ok: boolean;
  ideas?: string[];
  topics?: string[];
  error?: string;
}

interface SessionMatch {
  title: string;
  starts: string;
  ends: string;
  room: string;
  speakerNames: string[];
  score: number;
}

export default function AddTalkPage() {
  const [pageState, setPageState] = useState<PageState>('form');

  // Form fields
  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [note, setNote] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('image/jpeg');
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Session matching state
  const [matching, setMatching] = useState(false);
  const [sessionMatches, setSessionMatches] = useState<SessionMatch[]>([]);
  const [selectedSession, setSelectedSession] = useState<SessionMatch | null>(null);
  const [showManual, setShowManual] = useState(false);

  // Result
  const [ideas, setIdeas] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);

  // Error
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const mime = file.type || 'image/jpeg';
    setImageMime(mime);
    setSelectedSession(null);
    setSessionMatches([]);
    setShowManual(false);

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      const base64 = dataUrl.split(',')[1] ?? '';
      setImageBase64(base64);
      setImagePreview(dataUrl);

      // Match slide against known sessions using the base64 we just read
      setMatching(true);
      fetch('/api/talk/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType: mime }),
      })
        .then((r) => r.json())
        .then((result: { ok: boolean; matches?: SessionMatch[] }) => {
          if (result.ok && result.matches && result.matches.length > 0) {
            setSessionMatches(result.matches);
          } else {
            // No sessions in graph yet — go straight to manual
            setShowManual(true);
          }
        })
        .catch(() => setShowManual(true))
        .finally(() => setMatching(false));
    };
    reader.readAsDataURL(file);
  }

  function pickSession(s: SessionMatch) {
    setSelectedSession(s);
    setTitle(s.title);
    setSpeaker(s.speakerNames[0] ?? '');
    setSessionMatches([]);
  }

  async function handleSubmit() {
    setError('');
    if (!title.trim()) {
      setError('Please enter a talk title.');
      return;
    }
    setPageState('loading');
    try {
      const body: Record<string, string> = {
        title: title.trim(),
        speaker: speaker.trim(),
        note,
      };
      if (imageBase64) {
        body.imageBase64 = imageBase64;
        body.mimeType = imageMime;
      }

      const res = await fetch('/api/talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        setPageState('form');
        return;
      }
      setIdeas(data.ideas ?? []);
      setTopics(data.topics ?? []);
      setPageState('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setPageState('form');
    }
  }

  function resetForm() {
    setTitle('');
    setSpeaker('');
    setNote('');
    setImageBase64(null);
    setImagePreview(null);
    setIdeas([]);
    setTopics([]);
    setError('');
    setPageState('form');
    setSessionMatches([]);
    setSelectedSession(null);
    setShowManual(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  if (pageState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Extracting ideas&hellip;</p>
      </div>
    );
  }

  if (pageState === 'result') {
    return (
      <div className="px-4 py-6 space-y-4 max-w-[420px] mx-auto">
        <h1 className="text-xl font-bold tracking-tight">Saved!</h1>
        <p className="text-sm text-muted-foreground font-medium">{title}</p>

        {ideas.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Extracted Ideas
            </p>
            <div className="flex flex-wrap gap-2">
              {ideas.map((idea, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full bg-muted text-muted-foreground px-3 py-1 text-xs font-medium"
                >
                  {idea}
                </span>
              ))}
            </div>
          </div>
        )}

        {topics.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Topics
            </p>
            <div className="flex flex-wrap gap-2">
              {topics.map((topic, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-xs font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {ideas.length === 0 && topics.length === 0 && (
          <p className="text-sm text-muted-foreground">Talk saved. No ideas extracted.</p>
        )}

        <button
          type="button"
          onClick={resetForm}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          Add another talk
        </button>
      </div>
    );
  }

  // Default: form state
  return (
    <div className="px-4 py-6 space-y-4 max-w-[420px] mx-auto">
      <h1 className="text-xl font-bold tracking-tight">Add Talk</h1>

      {/* Slide photo — first, so classification can pre-fill title/speaker */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Slide photo{' '}
          <span className="text-muted-foreground font-normal">
            (optional — auto-fills title &amp; speaker)
          </span>
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleImageChange}
          className="w-full text-sm text-muted-foreground file:mr-3 file:py-1 file:px-3 file:rounded-md file:border file:border-border file:text-sm file:font-medium file:bg-background file:text-foreground hover:file:bg-muted cursor-pointer"
        />
        {imagePreview && (
          <div className="rounded-xl overflow-hidden border border-border bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Slide preview"
              className="w-full max-h-48 object-contain"
            />
          </div>
        )}
      </div>

      {/* Session picker — shown while matching or after match results */}
      {matching && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
          <span className="inline-block w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          Matching slide to schedule…
        </div>
      )}

      {sessionMatches.length > 0 && !selectedSession && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Which talk is this?</p>
          {sessionMatches.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickSession(s)}
              className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
            >
              <p className="font-medium text-sm leading-snug">{s.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {s.starts}{s.ends ? ` – ${s.ends}` : ''}{s.room ? ` · ${s.room}` : ''}
              </p>
              {s.speakerNames.length > 0 && (
                <p className="text-xs text-muted-foreground">{s.speakerNames.join(', ')}</p>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setSessionMatches([]); setShowManual(true); }}
            className="w-full text-center text-xs text-muted-foreground py-2 hover:text-foreground transition-colors"
          >
            None of these — type manually
          </button>
        </div>
      )}

      {/* Selected session badge */}
      {selectedSession && (
        <div className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-2">
          <div>
            <p className="text-sm font-medium text-green-900 leading-snug">{selectedSession.title}</p>
            {selectedSession.speakerNames.length > 0 && (
              <p className="text-xs text-green-700">{selectedSession.speakerNames.join(', ')}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setSelectedSession(null); setTitle(''); setSpeaker(''); setShowManual(true); }}
            className="text-xs text-green-600 hover:text-green-900 shrink-0 ml-2"
          >
            Change
          </button>
        </div>
      )}

      {/* Manual title/speaker — shown when no sessions in graph, or "None of these" tapped */}
      {(showManual || (!imageBase64 && !matching)) && !selectedSession && (
        <>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="talk-title">
              Talk title <span className="text-destructive">*</span>
            </label>
            <input
              id="talk-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Building Payment Systems at Scale"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="talk-speaker">
              Speaker name
            </label>
            <input
              id="talk-speaker"
              type="text"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Jane Smith"
            />
          </div>
        </>
      )}

      {/* Notes — always shown once a session is picked or manual mode active */}
      {(selectedSession || showManual || (!imageBase64 && !matching)) && (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="talk-note">
            My notes
          </label>
          <textarea
            id="talk-note"
            rows={5}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            placeholder="Key ideas, quotes, follow-up questions&hellip;"
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {(selectedSession || showManual || (!imageBase64 && !matching)) && (
        <button
          type="button"
          onClick={handleSubmit}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/80 transition-colors"
        >
          Save talk
        </button>
      )}
    </div>
  );
}
