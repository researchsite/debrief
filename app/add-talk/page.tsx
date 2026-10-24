'use client';

import { useState, useRef } from 'react';

type PageState = 'form' | 'loading' | 'result';

interface ApiResponse {
  ok: boolean;
  ideas?: string[];
  topics?: string[];
  error?: string;
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

  // Result
  const [ideas, setIdeas] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);

  // Error
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageMime(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      // data URL format: data:<mime>;base64,<data>
      const base64 = dataUrl.split(',')[1] ?? '';
      setImageBase64(base64);
      setImagePreview(dataUrl);
    };
    reader.readAsDataURL(file);
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

      {/* Talk title */}
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

      {/* Speaker name */}
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

      {/* Notes textarea */}
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

      {/* Optional slide photo */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Slide photo <span className="text-muted-foreground font-normal">(optional)</span>
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

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/80 transition-colors"
      >
        Save talk
      </button>
    </div>
  );
}
