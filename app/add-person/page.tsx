'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Switch } from '@/components/ui/switch';

// CommonGround mirrors lib/graph-writes.ts
interface CommonGround {
  alreadyConnected: boolean;
  warmIntro: { via: string; company: string }[];
  sharedEmployers: string[];
  sharedSchools: string[];
  sharedTopics: string[];
}

interface PersonResult {
  name: string;
  headline: string;
  city: string;
  linkedin_url: string;
}

interface ApiResponse {
  ok: boolean;
  person?: PersonResult;
  commonGround?: CommonGround;
  enrichmentFailed?: boolean;
  error?: string;
}

type PageState = 'form' | 'loading' | 'result' | 'manual';

export default function AddPersonPage() {
  const [pageState, setPageState] = useState<PageState>('form');

  // Form fields
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [note, setNote] = useState('');
  const [isHiring, setIsHiring] = useState(false);

  // QR scan
  const [qrActive, setQrActive] = useState(false);
  const [qrMessage, setQrMessage] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Result
  const [person, setPerson] = useState<PersonResult | null>(null);
  const [commonGround, setCommonGround] = useState<CommonGround | null>(null);

  // Manual fallback
  const [manualName, setManualName] = useState('');
  const [manualCompany, setManualCompany] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');

  // Error
  const [error, setError] = useState('');

  const stopQr = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setQrActive(false);
  }, []);

  const startQr = useCallback(async () => {
    setQrMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      setQrActive(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        // Start scanning frames
        const scan = async () => {
          if (!videoRef.current || !canvasRef.current) return;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(video, 0, 0);
              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              try {
                const jsQR = (await import('jsqr')).default;
                const code = jsQR(imageData.data, imageData.width, imageData.height);
                if (code && code.data.includes('linkedin.com/in/')) {
                  setLinkedinUrl(code.data);
                  stopQr();
                  return;
                }
              } catch {
                // jsQR not available, ignore
              }
            }
          }
          rafRef.current = requestAnimationFrame(scan);
        };
        rafRef.current = requestAnimationFrame(scan);
      }
    } catch {
      setQrMessage('QR scan available on mobile — camera access denied or unavailable.');
    }
  }, [stopQr]);

  async function handleSubmit() {
    setError('');
    if (!linkedinUrl.trim()) {
      setError('Please enter a LinkedIn URL.');
      return;
    }
    setPageState('loading');
    try {
      const res = await fetch('/api/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinUrl: linkedinUrl.trim(), note, isHiring }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        setPageState('form');
        return;
      }
      if (data.enrichmentFailed) {
        setManualNote(note);
        setPageState('manual');
        return;
      }
      if (data.person) {
        setPerson(data.person);
        setCommonGround(data.commonGround ?? null);
        setPageState('result');
      } else {
        setError('Unexpected response from server');
        setPageState('form');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setPageState('form');
    }
  }

  async function handleManualSave() {
    setManualError('');
    if (!manualName.trim()) {
      setManualError('Name is required.');
      return;
    }
    setManualSaving(true);
    try {
      // Build a synthetic LinkedIn URL from name for uniqueness
      const syntheticUrl = `https://www.linkedin.com/in/manual-${manualName.trim().toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
      const res = await fetch('/api/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedinUrl: syntheticUrl,
          note: manualNote,
          isHiring: false,
          manual: true,
          manualName: manualName.trim(),
          manualCompany: manualCompany.trim(),
        }),
      });
      const data = (await res.json()) as ApiResponse;
      if (!res.ok) {
        setManualError(data.error ?? 'Save failed');
        return;
      }
      // Reset to form for adding another
      resetForm();
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setManualSaving(false);
    }
  }

  function resetForm() {
    setLinkedinUrl('');
    setNote('');
    setIsHiring(false);
    setPerson(null);
    setCommonGround(null);
    setError('');
    setManualName('');
    setManualCompany('');
    setManualNote('');
    setManualError('');
    setPageState('form');
    stopQr();
  }

  // --- Render ---

  if (pageState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-muted-foreground">Enriching profile…</p>
      </div>
    );
  }

  if (pageState === 'result' && person) {
    const cg = commonGround;
    const hasAnyCommonGround =
      cg &&
      (cg.alreadyConnected ||
        cg.warmIntro.length > 0 ||
        cg.sharedEmployers.length > 0 ||
        cg.sharedSchools.length > 0 ||
        cg.sharedTopics.length > 0);

    return (
      <div className="px-4 py-6 space-y-4 max-w-[420px] mx-auto">
        <h1 className="text-xl font-bold tracking-tight">Person Added</h1>

        {/* Person card */}
        <div className="rounded-xl border border-border p-4 bg-card space-y-1">
          <p className="font-semibold text-foreground">{person.name}</p>
          <p className="text-sm text-muted-foreground">{person.headline}</p>
          <p className="text-xs text-muted-foreground">{person.city}</p>
          <Link
            href={`/person/${btoa(person.linkedin_url)}`}
            className="inline-block mt-2 text-sm text-primary underline hover:text-primary/80"
          >
            View full profile →
          </Link>
        </div>

        {/* Common ground */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Common Ground</p>
          {!hasAnyCommonGround && (
            <p className="text-sm text-muted-foreground">No common ground found yet</p>
          )}
          <div className="flex flex-wrap gap-2">
            {cg?.alreadyConnected && (
              <span className="inline-flex items-center rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-medium">
                Already connected
              </span>
            )}
            {cg?.warmIntro.map((intro, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-xs font-medium"
              >
                Intro via {intro.via} at {intro.company}
              </span>
            ))}
            {cg?.sharedEmployers.map((company) => (
              <span
                key={company}
                className="inline-flex items-center rounded-full bg-purple-100 text-purple-800 px-3 py-1 text-xs font-medium"
              >
                Both worked at {company}
              </span>
            ))}
            {cg?.sharedSchools.map((school) => (
              <span
                key={school}
                className="inline-flex items-center rounded-full bg-purple-100 text-purple-800 px-3 py-1 text-xs font-medium"
              >
                Both went to {school}
              </span>
            ))}
            {cg?.sharedTopics.map((topic) => (
              <span
                key={topic}
                className="inline-flex items-center rounded-full bg-gray-100 text-gray-800 px-3 py-1 text-xs font-medium"
              >
                {topic}
              </span>
            ))}
          </div>
        </div>

        {/* Note preview */}
        {note.trim() && (
          <div className="rounded-xl border border-border p-3 bg-muted/30">
            <p className="text-xs text-muted-foreground font-medium mb-1">Your note</p>
            <p className="text-sm">{note}</p>
          </div>
        )}

        <button
          type="button"
          onClick={resetForm}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/80 transition-colors"
        >
          Add another
        </button>
      </div>
    );
  }

  if (pageState === 'manual') {
    return (
      <div className="px-4 py-6 space-y-4 max-w-[420px] mx-auto">
        <h1 className="text-xl font-bold tracking-tight">Add manually</h1>
        <p className="text-sm text-muted-foreground">
          Could not fetch LinkedIn profile. Fill in what you know.
        </p>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="manual-name">
            Name <span className="text-destructive">*</span>
          </label>
          <input
            id="manual-name"
            type="text"
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Full name"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="manual-company">
            Company
          </label>
          <input
            id="manual-company"
            type="text"
            value={manualCompany}
            onChange={(e) => setManualCompany(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Current company"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="manual-note">
            Note
          </label>
          <textarea
            id="manual-note"
            rows={3}
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>

        {manualError && (
          <p className="text-sm text-destructive">{manualError}</p>
        )}

        <button
          type="button"
          onClick={handleManualSave}
          disabled={manualSaving}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/80 disabled:opacity-50 transition-colors"
        >
          {manualSaving ? 'Saving…' : 'Save manually'}
        </button>

        <button
          type="button"
          onClick={resetForm}
          className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Default: form state
  return (
    <div className="px-4 py-6 space-y-4 max-w-[420px] mx-auto">
      <h1 className="text-xl font-bold tracking-tight">Add Person</h1>

      {/* LinkedIn URL */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="linkedin-url">
          LinkedIn URL
        </label>
        <div className="flex gap-2">
          <input
            id="linkedin-url"
            type="url"
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://www.linkedin.com/in/..."
          />
          <button
            type="button"
            onClick={qrActive ? stopQr : startQr}
            className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
            aria-label="Scan QR code"
          >
            {qrActive ? 'Stop' : 'Scan QR'}
          </button>
        </div>
        {qrMessage && (
          <p className="text-xs text-muted-foreground">{qrMessage}</p>
        )}
      </div>

      {/* QR video + hidden canvas */}
      {qrActive && (
        <div className="rounded-xl overflow-hidden border border-border bg-black">
          <video
            ref={videoRef}
            className="w-full"
            muted
            playsInline
            autoPlay
          />
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />

      {/* Note textarea */}
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="note">
          What did you talk about?
        </label>
        <textarea
          id="note"
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Topics, ideas, follow-ups…"
        />
      </div>

      {/* Hiring toggle */}
      <div className="flex items-center justify-between rounded-xl border border-border p-3 bg-card">
        <span className="text-sm font-medium">They&apos;re hiring for my role</span>
        <Switch
          checked={isHiring}
          onCheckedChange={setIsHiring}
          aria-label="They are hiring for my role"
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:bg-primary/80 transition-colors"
      >
        Add Person
      </button>
    </div>
  );
}
