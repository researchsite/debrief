'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { readJsonResponse } from '@/lib/http-json';
import type { ImportPreviewItem, QrProvenance } from '@/lib/import-types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ClassificationResult } from '@/lib/classify';
import { normalizeClassificationResult } from '@/lib/classification-result';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CameraFrame } from '@/components/scenes/import/CameraFrame';
import { PxButton } from '@/components/scenes/import/PxButton';
import { BigKey, CamKey } from '@/components/scenes/import/CameraKeys';
import { TranscriptReview } from '@/components/scenes/import/TranscriptReview';
import type { ReviewItem } from '@/app/api/transcripts/route';
import { PX } from '@/components/pixel';

const FIELD = 'mt-1 rounded-none border-2 border-[var(--px-ink)] bg-white font-pixel-body text-lg text-[var(--px-ink)] shadow-none';
const LABEL = 'font-pixel text-xs text-[var(--px-ink)]';
const MUTED = 'text-[#5b5478]';

interface FileResult {
  id: string;
  qr?: QrProvenance;
  resolving?: boolean;
  resolveError?: string;
  saving?: boolean;
  saveError?: string;
  personKey?: string;
  warning?: string;
  file: File;
  filePath?: string;
  result?: ClassificationResult;
  error?: string;
  saved?: boolean;
  savedMessage?: string;
  editing?: boolean;
  editedResult?: ClassificationResult;
}

type PageState = 'upload' | 'classifying' | 'review';

interface TranscriptResult {
  id: string;
  file: File;
  filename?: string;
  items?: ReviewItem[];
  error?: string;
}

const isTranscript = (file: File) => file.name.toLowerCase().endsWith('.vtt');

export default function ImportPage() {
  const [pageState, setPageState] = useState<PageState>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [currentFile, setCurrentFile] = useState('');
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptResult[]>([]);
  const transcriptInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const qrQueue = useRef<{ id: string; payload: string }[]>([]);
  const qrRequests = useRef(new Map<string, AbortController>());
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const requests = qrRequests.current;
    return () => { alive.current = false; qrQueue.current = []; requests.forEach((controller) => controller.abort()); };
  }, []);

  function drainQrQueue() {
    if (!alive.current) return;
    while (qrRequests.current.size < 3 && qrQueue.current.length) {
      const job = qrQueue.current.shift()!;
      const controller = new AbortController();
      qrRequests.current.set(job.id, controller);
      void (async () => {
        try {
          const response = await fetch('/api/import/resolve-qr', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: job.payload }),
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
          });
          const { item } = await readJsonResponse<{ item: ImportPreviewItem }>(response, 'Could not read linked details');
          const result = normalizeClassificationResult(item.result);
          if (alive.current) setFileResults((prev) => prev.map((row) => row.id === job.id ? { ...row, result, editedResult: result, qr: item.qr ?? row.qr, resolving: false, resolveError: item.error } : row));
        } catch {
          if (alive.current) setFileResults((prev) => prev.map((row) => row.id === job.id ? { ...row, resolving: false, resolveError: 'Could not read linked details. Retry, or save the decoded QR contents.' } : row));
        } finally {
          qrRequests.current.delete(job.id);
          drainQrQueue();
        }
      })();
    }
  }
  function enqueueQr(row: FileResult) {
    if (!row.qr || qrRequests.current.has(row.id) || qrQueue.current.some((job) => job.id === row.id)) return;
    setFileResults((prev) => prev.map((item) => item.id === row.id ? { ...item, resolving: true, resolveError: undefined } : item));
    qrQueue.current.push({ id: row.id, payload: row.qr.payload });
    drainQrQueue();
  }
  function clearImports() {
    qrQueue.current = []; qrRequests.current.forEach((controller) => controller.abort());
    setPageState('upload'); setFiles([]); setFileResults([]); setTranscripts([]);
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
    // Allow re-selecting the same file after removing it.
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    if (files.length === 0) return;

    setPageState('classifying');
    const results: FileResult[] = [];
    const transcriptResults: TranscriptResult[] = [];

    for (const file of files) {
      setCurrentFile(file.name);
      if (isTranscript(file)) {
        transcriptResults.push(await analyzeTranscript(file));
        continue;
      }
      const formData = new FormData();
      formData.append('file', file);

      try {
        const resp = await fetch('/api/import/classify', {
          method: 'POST',
          body: formData,
        });
        const data = await readJsonResponse<{ items?: ImportPreviewItem[]; _filePath?: string; warning?: string }>(resp, 'Could not analyze this file');
        const items: ImportPreviewItem[] = Array.isArray(data.items) ? data.items : [{ id: crypto.randomUUID(), source: 'image', result: normalizeClassificationResult(data) }];
        for (const [index, item] of items.entries()) {
          const result = normalizeClassificationResult(item.result);
          results.push({ id: crypto.randomUUID(), file, result, editedResult: result, filePath: data._filePath, qr: item.qr, warning: index === 0 ? data.warning : undefined });
        }
      } catch (err) {
        results.push({ id: crypto.randomUUID(), file, error: err instanceof Error ? err.message : 'Classification failed' });
      }
    }

    setFileResults(results);
    setTranscripts(transcriptResults);
    setPageState('review');
    for (const row of results) if (row.qr) enqueueQr(row);
  };

  async function analyzeTranscript(file: File): Promise<TranscriptResult> {
    const id = crypto.randomUUID();
    try {
      const formData = new FormData();
      formData.append('file', file);
      const resp = await fetch('/api/transcripts', { method: 'POST', body: formData });
      const data = await readJsonResponse<{ ok: boolean; items?: ReviewItem[]; filename?: string; error?: string }>(resp, 'Could not analyze this transcript');
      if (!data.ok || !data.items) return { id, file, error: data.error ?? 'Failed to analyze transcript' };
      return { id, file, items: data.items, filename: data.filename ?? file.name };
    } catch (err) {
      return { id, file, error: err instanceof Error ? err.message : 'Failed to analyze transcript' };
    }
  }

  const handleSave = async (id: string) => {
    const fr = fileResults.find((row) => row.id === id);
    if (!fr?.result || fr.saving || fr.resolving) return;
    setFileResults((prev) => prev.map((row) => row.id === id ? { ...row, saving: true, saveError: undefined } : row));

    const resultToSave = fr.editedResult ?? fr.result;

    try {
      const resp = await fetch('/api/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: resultToSave, filePath: fr.filePath, qr: fr.qr }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await readJsonResponse<{ ok: boolean; personId?: string }>(resp, 'Could not save this item');
      const message = resultToSave.kind === 'coupon' ? 'Saved to Wallet!' : resultToSave.kind === 'badge' || resultToSave.kind === 'business_card' ? `${resultToSave.name} added` : 'Saved!';
      setFileResults((prev) => prev.map((row) => row.id === id ? { ...row, saved: true, saving: false, savedMessage: message, personKey: data.personId } : row));
    } catch (error) {
      setFileResults((prev) => prev.map((row) => row.id === id ? { ...row, saving: false, saveError: error instanceof Error ? error.message : 'Save failed. Please retry.' } : row));
    }
  };

  const handleDismiss = (id: string) => {
    qrQueue.current = qrQueue.current.filter((job) => job.id !== id);
    qrRequests.current.get(id)?.abort();
    setFileResults((prev) => prev.filter((row) => row.id !== id));
  };
  const updateEditedField = (id: string, field: string, value: unknown) => {
    setFileResults((prev) => prev.map((row) => row.id === id ? { ...row, editedResult: { ...(row.editedResult ?? row.result!), [field]: value } } : row));
  };
  const toggleEdit = (id: string) => {
    setFileResults((prev) => prev.map((row) => row.id === id ? { ...row, editing: !row.editing } : row));
  };

  const importWithFlash = () => {
    if (files.length === 0) return;
    setFlashKey((key) => key + 1);
    void handleImport();
  };
  const pick = (input: HTMLInputElement | null) => {
    if (pageState === 'review') clearImports();
    input?.click();
  };
  const busy = pageState === 'classifying';

  const controls = (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-none sm:gap-3">
        <CamKey icon="🎙" accent={PX.pink} label="Import Transcript" onClick={() => pick(transcriptInputRef.current)} disabled={busy} />
        <CamKey icon="📎" accent={PX.sky} label="Pick files" onClick={() => pick(fileInputRef.current)} disabled={busy} />
        <CamKey icon="📷" accent={PX.sun} label="Pick Photo" onClick={() => pick(imageInputRef.current)} disabled={busy} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center">
        {pageState === 'review' ? (
          <BigKey className="w-full max-w-[8.5rem] sm:w-[78%] sm:max-w-[200px]" onClick={clearImports}>Import<br />more</BigKey>
        ) : (
          <BigKey className="w-full max-w-[8.5rem] sm:w-[78%] sm:max-w-[200px]" disabled={files.length === 0 || busy} onClick={importWithFlash}>
            Import{files.length > 0 ? <span className="text-[10px] sm:text-xs">({files.length})</span> : null}
          </BigKey>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleFileChange} />
      <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
      <input ref={transcriptInputRef} type="file" accept=".vtt,text/vtt" multiple className="hidden" onChange={handleFileChange} />
    </>
  );

  let screen: ReactNode;
  if (pageState === 'upload') {
    screen = (
      <div className="flex flex-1 flex-col gap-4 text-[var(--px-ink)]">
        <div className="text-center">
          <h1 className="font-pixel mb-1 text-2xl sm:text-4xl" style={{ textShadow: '3px 3px 0 var(--px-sun)' }}>Import Anything</h1>
          <p className={`font-pixel-body text-lg leading-tight ${MUTED}`}>
            Slides, coupons, business cards, agendas - drop them all here
          </p>
        </div>

        {files.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-2 p-4 text-center"
            style={{ border: '4px dashed rgba(27,21,48,0.45)', background: 'rgba(255,247,230,0.6)', minHeight: '7rem' }}
          >
            <span className="font-pixel text-xs sm:text-sm">Drop files on the screen</span>
            <span className={`font-pixel-body text-base leading-tight ${MUTED}`}>or use the camera keys · Images, PDFs &amp; .vtt transcripts</span>
          </button>
        ) : (
          <div className="px-panel flex flex-col gap-2 p-3">
            <p className="font-pixel text-sm">{files.length} file{files.length !== 1 ? 's' : ''} selected</p>
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2 border-2 border-[var(--px-ink)] bg-white px-3 py-1.5">
                <span className="font-pixel-body min-w-0 truncate text-lg">{isTranscript(f) ? '🎙 ' : ''}{f.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${f.name}`}
                  onClick={() => removeFile(i)}
                  className="font-pixel flex h-6 w-6 shrink-0 items-center justify-center border-2 border-[var(--px-ink)] text-sm leading-none hover:bg-[var(--px-red)] hover:text-white"
                >
                  ×
                </button>
              </div>
            ))}
            <p className={`font-pixel-body text-base leading-tight ${MUTED}`}>Press Import when ready.</p>
          </div>
        )}
      </div>
    );
  } else if (pageState === 'classifying') {
    screen = (
      <div role="status" className="flex flex-1 flex-col items-center justify-center gap-5 text-[var(--px-ink)]">
        <div className="px-loader" />
        <h2 className="font-pixel text-center text-2xl">Analyzing…</h2>
        <p className={`font-pixel-body max-w-full truncate text-center text-lg ${MUTED}`}>{currentFile}</p>
        <div className="h-4 w-full max-w-xs border-4 border-[var(--px-ink)] bg-white">
          <div className="h-full w-1/2 animate-pulse" style={{ background: 'var(--px-teal)' }} />
        </div>
      </div>
    );
  } else {
    screen = (
      <div className="flex flex-col gap-4 text-[var(--px-ink)]">
        <h1 className="font-pixel text-xl sm:text-2xl">Review &amp; Save</h1>

        {fileResults.map((fr) => (
          <div key={fr.id} data-import-item={fr.id} className="space-y-2">
            {fr.warning && <p role="status" className="font-pixel-body border-2 border-[var(--px-ink)] px-2 py-1 text-base" style={{ background: 'var(--px-cream)' }}>{fr.warning}</p>}
            {fr.qr && !fr.saved && <div className="px-panel space-y-2 p-3 text-sm">
              <p className="font-pixel">QR code · {fr.file.name}</p>
              <p className="font-pixel-body break-all whitespace-pre-wrap text-base">{fr.qr.payload}</p>
              {fr.resolving && <p role="status" className="font-pixel-body flex items-center gap-2 text-base"><span className="px-loader inline-block !h-3 !w-3" />Reading linked details…</p>}
              {fr.resolveError && <><p className={`font-pixel-body text-base ${MUTED}`}>{fr.resolveError}</p><PxButton variant="secondary" size="sm" onClick={() => enqueueQr(fr)}>Retry linked details</PxButton></>}
            </div>}
            {fr.saveError && <p role="alert" className="font-pixel-body border-2 border-[var(--px-ink)] px-2 py-1 text-base text-white" style={{ background: 'var(--px-red)' }}>{fr.saveError}</p>}
            <fieldset disabled={fr.resolving || fr.saving} className="min-w-0 border-0 p-0">
              <ReviewCard fr={fr} onSave={() => handleSave(fr.id)} onDismiss={() => handleDismiss(fr.id)} onToggleEdit={() => toggleEdit(fr.id)} onUpdateField={(field, value) => updateEditedField(fr.id, field, value)} />
            </fieldset>
            {fr.qr && !fr.saved && <PxButton variant="ghost" size="sm" onClick={() => handleDismiss(fr.id)}>Dismiss QR</PxButton>}
          </div>
        ))}

        {transcripts.map((t) => t.items ? (
          <TranscriptReview key={t.id} filename={t.filename ?? t.file.name} items={t.items} onDismiss={() => setTranscripts((prev) => prev.filter((row) => row.id !== t.id))} />
        ) : (
          <div key={t.id} className="px-panel flex flex-col gap-2 p-3" style={{ background: '#ffe1e4' }}>
            <p className="font-pixel text-sm" style={{ color: '#c81e33' }}>Error: {t.error}</p>
            <p className={`font-pixel-body text-base ${MUTED}`}>{t.file.name}</p>
            <PxButton variant="secondary" size="sm" onClick={() => setTranscripts((prev) => prev.filter((row) => row.id !== t.id))}>Dismiss</PxButton>
          </div>
        ))}

        {fileResults.length === 0 && transcripts.length === 0 && (
          <p className="font-pixel pt-8 text-center text-lg">All done! ✓</p>
        )}
      </div>
    );
  }

  return (
    <CameraFrame
      controls={controls}
      flashKey={flashKey}
      dragOver={dragOver}
      onDragOver={pageState === 'upload' ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={pageState === 'upload' ? () => setDragOver(false) : undefined}
      onDrop={pageState === 'upload' ? handleDrop : undefined}
    >
      {screen}
    </CameraFrame>
  );
}

// ─── Review card sub-component ───────────────────────────────────

interface ReviewCardProps {
  fr: FileResult;
  onSave: () => void;
  onDismiss: () => void;
  onToggleEdit: () => void;
  onUpdateField: (field: string, value: unknown) => void;
}

function PxCard({ title, accent, action, children }: { title: string; accent: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-panel">
      <div className="flex items-center justify-between gap-2 border-b-4 border-[var(--px-ink)] px-3 py-2" style={{ background: accent }}>
        <h3 className="font-pixel text-base">{title}</h3>
        {action}
      </div>
      <div className="flex flex-col gap-3 p-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Label className={LABEL}>{label}</Label>
      {children}
    </div>
  );
}

function Chip({ children, bg = 'var(--px-cream)' }: { children: ReactNode; bg?: string }) {
  return <span className="px-chip" style={{ background: bg }}>{children}</span>;
}

function ReviewCard({ fr, onSave, onDismiss, onToggleEdit, onUpdateField }: ReviewCardProps) {
  if (fr.saved) {
    return (
      <div className="px-panel p-3" style={{ background: '#dff7df' }}>
        <p className="font-pixel text-sm" style={{ color: 'var(--px-leaf)' }}>✓ {fr.savedMessage}</p>
        {fr.personKey && <Link href={`/person/${encodeURIComponent(btoa(fr.personKey))}`} className="font-pixel-body text-lg underline">View contact →</Link>}
        {fr.savedMessage?.includes('Wallet') && (
          <Link href="/wallet" className="font-pixel-body mt-1 block text-lg underline">
            View in Wallet →
          </Link>
        )}
      </div>
    );
  }

  if (fr.error) {
    return (
      <div className="px-panel flex flex-col gap-2 p-3" style={{ background: '#ffe1e4' }}>
        <p className="font-pixel text-sm" style={{ color: '#c81e33' }}>Error: {fr.error}</p>
        <PxButton variant="secondary" size="sm" onClick={onDismiss}>Dismiss</PxButton>
      </div>
    );
  }

  const result = fr.editedResult ?? fr.result;
  if (!result) return null;

  const isEditing = fr.editing ?? false;
  const editToggle = (
    <PxButton variant="secondary" size="sm" onClick={onToggleEdit}>
      {isEditing ? 'Done' : 'Edit'}
    </PxButton>
  );

  switch (result.kind) {
    case 'coupon':
      return (
        <PxCard title="🎟 Coupon" accent="var(--px-orange)" action={editToggle}>
          {isEditing ? (
            <>
              <Field label="Code">
                <Input
                  value={result.code}
                  onChange={(e) => onUpdateField('code', e.target.value)}
                  className={`${FIELD} font-bold`}
                />
              </Field>
              <Field label="Vendor">
                <Input value={result.vendor} onChange={(e) => onUpdateField('vendor', e.target.value)} className={FIELD} />
              </Field>
              <Field label="Value">
                <Input value={result.value} onChange={(e) => onUpdateField('value', e.target.value)} className={FIELD} />
              </Field>
              <Field label="Description">
                <Textarea value={result.description} onChange={(e) => onUpdateField('description', e.target.value)} className={FIELD} rows={2} />
              </Field>
              <Field label="Expires (ISO date or blank)">
                <Input value={result.expires ?? ''} onChange={(e) => onUpdateField('expires', e.target.value || null)} className={FIELD} />
              </Field>
            </>
          ) : (
            <>
              <div className="font-pixel border-4 border-dashed border-[var(--px-ink)] bg-white px-3 py-2 text-center text-2xl tracking-wider">
                {result.code}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="font-pixel text-sm">{result.vendor}</span>
                <Chip bg="var(--px-sun)">{result.value}</Chip>
              </div>
              {result.description && (
                <p className={`font-pixel-body text-lg leading-tight ${MUTED}`}>{result.description}</p>
              )}
              {result.expires && (
                <p className={`font-pixel-body text-base ${MUTED}`}>Expires: {result.expires}</p>
              )}
            </>
          )}
          <PxButton className="mt-1 w-full" onClick={onSave}>
            Save to Wallet
          </PxButton>
        </PxCard>
      );

    case 'slide':
    case 'deck':
      return (
        <PxCard title={`🖼 ${result.kind === 'deck' ? 'Deck' : 'Slide'}`} accent="var(--px-sky)" action={editToggle}>
          {isEditing ? (
            <>
              <Field label="Title">
                <Input value={result.title} onChange={(e) => onUpdateField('title', e.target.value)} className={FIELD} />
              </Field>
              <Field label="Speaker">
                <Input value={result.speaker} onChange={(e) => onUpdateField('speaker', e.target.value)} className={FIELD} />
              </Field>
              <Field label="Ideas (one per line)">
                <Textarea
                  value={result.ideas.join('\n')}
                  onChange={(e) => onUpdateField('ideas', e.target.value.split('\n').filter(Boolean))}
                  className={FIELD}
                  rows={3}
                />
              </Field>
            </>
          ) : (
            <>
              <p className="font-pixel text-base">{result.title}</p>
              {result.speaker && <p className={`font-pixel-body text-lg ${MUTED}`}>by {result.speaker}</p>}
              {result.ideas.length > 0 && (
                <ul className="font-pixel-body list-inside space-y-1 text-lg leading-tight">
                  {result.ideas.map((idea, i) => <li key={i}><span aria-hidden>▸ </span><span>{idea}</span></li>)}
                </ul>
              )}
              {result.topics.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {result.topics.map((t, i) => <Chip key={i}>{t}</Chip>)}
                </div>
              )}
            </>
          )}
          <PxButton className="mt-1 w-full" onClick={onSave}>Save</PxButton>
        </PxCard>
      );

    case 'badge':
    case 'business_card':
      return (
        <PxCard title={`👤 ${result.kind === 'badge' ? 'Badge' : 'Business Card'}`} accent="var(--px-grass)" action={editToggle}>
          {isEditing ? (
            <>
              <Field label="Name">
                <Input value={result.name} onChange={(e) => onUpdateField('name', e.target.value)} className={FIELD} />
              </Field>
              <Field label="Company">
                <Input value={result.company} onChange={(e) => onUpdateField('company', e.target.value)} className={FIELD} />
              </Field>
              <Field label="Title">
                <Input value={result.title} onChange={(e) => onUpdateField('title', e.target.value)} className={FIELD} />
              </Field>
              <Field label="LinkedIn URL">
                <Input value={result.linkedin_url} onChange={(e) => onUpdateField('linkedin_url', e.target.value)} className={FIELD} />
              </Field>
              <Field label="Email"><Input aria-label="Email" value={result.email} onChange={(e) => onUpdateField('email', e.target.value)} className={FIELD} /></Field>
              <Field label="Phone"><Input aria-label="Phone" value={result.phone ?? ''} onChange={(e) => onUpdateField('phone', e.target.value)} className={FIELD} /></Field>
            </>
          ) : (
            <>
              <p className="font-pixel text-lg">{result.name}</p>
              <p className={`font-pixel-body text-lg leading-tight ${MUTED}`}>{result.title} @ {result.company}</p>
              {result.email && <p className="font-pixel-body text-lg">{result.email}</p>}
              {result.phone && <p className="font-pixel-body text-lg">{result.phone}</p>}
              {result.linkedin_url && (
                <p className="font-pixel-body truncate text-base" style={{ color: 'var(--px-blue)' }}>{result.linkedin_url}</p>
              )}
            </>
          )}
          <PxButton className="mt-1 w-full" onClick={onSave}>Add Person</PxButton>
        </PxCard>
      );

    case 'agenda':
      return (
        <PxCard title="📅 Agenda" accent="var(--px-purple)">
          {result.sessions.map((s, i) => (
            <div key={i} className="border-l-4 pl-3" style={{ borderColor: 'var(--px-purple)' }}>
              <p className="font-pixel text-sm">{s.title}</p>
              <p className={`font-pixel-body text-base ${MUTED}`}>{s.starts}{s.room ? ` · ${s.room}` : ''}{s.speaker ? ` · ${s.speaker}` : ''}</p>
            </div>
          ))}
          <PxButton className="mt-1 w-full" onClick={onSave}>Save</PxButton>
        </PxCard>
      );

    default: {
      const other = result as { kind: string; text?: string };
      return (
        <PxCard title={`📄 ${other.kind === 'qr' ? 'QR Code' : 'Other'}`} accent="var(--px-cream)">
          {isEditing && fr.qr ? <Textarea aria-label="QR details" value={other.text ?? ''} onChange={(event) => onUpdateField('text', event.target.value)} className={FIELD} /> : other.text && <p className={`font-pixel-body whitespace-pre-wrap break-all text-lg ${MUTED}`}>{other.text}</p>}
          {fr.qr && <><PxButton variant="ghost" onClick={onToggleEdit}>{isEditing ? 'Done' : 'Edit'}</PxButton><PxButton onClick={onSave}>Save QR details</PxButton></>}
          <PxButton variant="secondary" className="w-full" onClick={onDismiss}>Dismiss</PxButton>
        </PxCard>
      );
    }
  }
}
