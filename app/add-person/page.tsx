'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { readJsonResponse } from '@/lib/http-json';
import { parseQrPayload } from '@/lib/qr-payload';
import type { ImportPreviewItem } from '@/lib/import-types';
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
  id?: string;
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
  warnings?: string[];
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
  const [warnings, setWarnings] = useState<string[]>([]);
  const requestIdRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const qrFileRef = useRef<HTMLInputElement>(null);
  const [qrCandidates, setQrCandidates] = useState<string[]>([]);
  const [qrReading, setQrReading] = useState(false);
  const mountedRef = useRef(true);

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

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; stopQr(); };
  }, [stopQr]);

  const startQr = useCallback(async () => {
    setQrMessage('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      setQrActive(true);
    } catch { setQrMessage('Camera access is unavailable. You can upload a QR image instead.'); }
  }, []);

  useEffect(() => {
    if (!qrActive || !videoRef.current) return;
    let stopped = false;
    const video = videoRef.current;
    video.srcObject = streamRef.current;
    async function begin() {
      try {
        await video.play();
        const jsQR = (await import('jsqr')).default;
        const scan = () => {
          if (stopped) return;
          const canvas = canvasRef.current;
          if (canvas && video.readyState >= 2) {
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx && canvas.width && canvas.height) {
              ctx.drawImage(video, 0, 0);
              const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(image.data, image.width, image.height);
              if (code) {
                const parsed = parseQrPayload(code.data);
                if (parsed.kind === 'linkedin') { setLinkedinUrl(parsed.url); stopQr(); return; }
                if (parsed.kind === 'contact' && parsed.contact.linkedin_url) { setLinkedinUrl(parsed.contact.linkedin_url); stopQr(); return; }
                setQrMessage('This code is not a LinkedIn profile. Use Import to save its contents.');
              }
            }
          }
          rafRef.current = requestAnimationFrame(scan);
        };
        if (!stopped) rafRef.current = requestAnimationFrame(scan);
      } catch { if (!stopped) { setQrMessage('Could not start the camera. Upload a QR image instead.'); stopQr(); } }
    }
    void begin();
    return () => {
      stopped = true;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [qrActive, stopQr]);

  async function handleQrImage(file: File) {
    setQrReading(true); setQrMessage(''); setQrCandidates([]); stopQr();
    try {
      const form = new FormData(); form.append('file', file); form.append('scanOnly', 'true');
      const response = await fetch('/api/import/classify', { method: 'POST', body: form, signal: AbortSignal.timeout(30000) });
      const data = await readJsonResponse<{ items: ImportPreviewItem[] }>(response, 'Could not scan this image');
      if (!data.items?.length) { setQrMessage('No readable QR code found. Try a clearer photo.'); return; }
      const candidates = [...new Set((data.items ?? []).flatMap((item) => {
        if (!item.qr) return [];
        const parsed = parseQrPayload(item.qr.payload);
        return parsed.kind === 'linkedin' ? [parsed.url] : parsed.kind === 'contact' && parsed.contact.linkedin_url ? [parsed.contact.linkedin_url] : [];
      }))];
      if (candidates.length === 1) { setLinkedinUrl(candidates[0]); setQrMessage('LinkedIn profile found. Add your notes, then save.'); }
      else if (candidates.length) { setQrCandidates(candidates); setQrMessage('Choose the person you met.'); }
      else setQrMessage('No LinkedIn profile found. Use Import to review other QR contents.');
    } catch (error) { setQrMessage(error instanceof Error ? error.message : 'Could not scan this image. Please retry.'); }
    finally { setQrReading(false); if (qrFileRef.current) qrFileRef.current.value = ''; }
  }

  async function handleSubmit() {
    setError('');
    if (!linkedinUrl.trim()) {
      setError('Please enter a LinkedIn URL.');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    requestIdRef.current ??= crypto.randomUUID();
    setPageState('loading');
    try {
      const res = await fetch('/api/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linkedinUrl: linkedinUrl.trim(), note, isHiring, requestId: requestIdRef.current }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await readJsonResponse<ApiResponse>(res, 'Could not save this person');
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
        setWarnings(data.warnings ?? []);
        setPageState('result');
      } else {
        setError('Unexpected response from server');
        setPageState('form');
      }
    } catch (err) {
      setError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'The request timed out. Your details are still here. Please retry.');
      setPageState('form');
    } finally { submittingRef.current = false; }
  }

  async function handleManualSave() {
    setManualError('');
    if (!manualName.trim()) {
      setManualError('Name is required.');
      return;
    }
    if (submittingRef.current) return;
    submittingRef.current = true;
    requestIdRef.current ??= crypto.randomUUID();
    setManualSaving(true);
    try {
      const res = await fetch('/api/person', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedinUrl: linkedinUrl.trim(),
          requestId: requestIdRef.current,
          note: manualNote,
          isHiring,
          manual: true,
          manualName: manualName.trim(),
          manualCompany: manualCompany.trim(),
        }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await readJsonResponse<ApiResponse>(res, 'Could not save this person');
      if (!res.ok) {
        setManualError(data.error ?? 'Save failed');
        return;
      }
      if (data.person) { setPerson(data.person); setCommonGround(data.commonGround ?? null); setWarnings(data.warnings ?? []); setPageState('result'); }
      else throw new Error('Could not confirm the save. Please retry.');
    } catch (err) {
      setManualError(err instanceof Error && err.name !== 'TimeoutError' ? err.message : 'The request timed out. Your details are still here. Please retry.');
    } finally {
      setManualSaving(false);
      submittingRef.current = false;
    }
  }

  function resetForm() {
    requestIdRef.current = null;
    setWarnings([]);
    setQrCandidates([]);
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

        {warnings.map((warning) => <p key={warning} className="text-sm text-muted-foreground">{warning}</p>)}
        {/* Person card */}
        <div className="rounded-xl border border-border p-4 bg-card space-y-1">
          <p className="font-semibold text-foreground">{person.name}</p>
          <p className="text-sm text-muted-foreground">{person.headline}</p>
          <p className="text-xs text-muted-foreground">{person.city}</p>
          <Link
            href={`/person/${encodeURIComponent(btoa(unescape(encodeURIComponent(person.linkedin_url || person.id || ''))))}`}
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

      <input ref={qrFileRef} type="file" accept="image/*" aria-label="Upload QR image" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleQrImage(file); }} />
      <button type="button" disabled={qrReading} className="text-sm underline" onClick={() => qrFileRef.current?.click()}>{qrReading ? 'Reading QR codes…' : 'Upload QR image'}</button>
      {qrCandidates.map((candidate) => <button key={candidate} type="button" className="block text-sm underline" onClick={() => { setLinkedinUrl(candidate); setQrCandidates([]); setQrMessage('Profile selected.'); }}>{candidate}</button>)}
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
