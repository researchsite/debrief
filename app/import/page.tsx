'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { readJsonResponse } from '@/lib/http-json';
import type { ImportPreviewItem, QrProvenance } from '@/lib/import-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type { ClassificationResult } from '@/lib/classify';
import { normalizeClassificationResult } from '@/lib/classification-result';
import Link from 'next/link';

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

export default function ImportPage() {
  const [pageState, setPageState] = useState<PageState>('upload');
  const [files, setFiles] = useState<File[]>([]);
  const [currentFile, setCurrentFile] = useState('');
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
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
    setPageState('upload'); setFiles([]); setFileResults([]);
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
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleImport = async () => {
    if (files.length === 0) return;

    setPageState('classifying');
    const results: FileResult[] = [];

    for (const file of files) {
      setCurrentFile(file.name);
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
    setPageState('review');
    for (const row of results) if (row.qr) enqueueQr(row);
  };

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

  // Upload state
  if (pageState === 'upload') {
    return (
      <div className="flex flex-col px-4 pt-8 pb-4 gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-1">Import Anything</h1>
          <p className="text-muted-foreground text-sm">
            Slides, coupons, business cards, agendas — drop them all here
          </p>
        </div>

        {/* Transcript import card */}
        <Link href="/import/transcript">
          <div className="border rounded-xl px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors cursor-pointer">
            <div className="text-2xl">🎙</div>
            <div className="flex-1">
              <p className="font-medium text-sm">Import Transcript</p>
              <p className="text-xs text-muted-foreground">Upload a .vtt file from Zoom to extract conversations</p>
            </div>
            <span className="text-muted-foreground text-sm">→</span>
          </div>
        </Link>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-border'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-4xl">📎</div>
          <p className="text-sm text-muted-foreground text-center">
            Tap to pick files or drag them here
          </p>
          <p className="text-xs text-muted-foreground">Images &amp; PDFs supported</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Camera button */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => cameraInputRef.current?.click()}
        >
          📷 Take Photo
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
        </Button>

        {/* File list */}
        {files.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{files.length} file{files.length !== 1 ? 's' : ''} selected</p>
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between bg-muted/40 rounded-lg px-3 py-2">
                <span className="text-sm truncate max-w-[70%]">{f.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  className="text-muted-foreground hover:text-destructive text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <Button
          className="w-full"
          disabled={files.length === 0}
          onClick={handleImport}
        >
          Import {files.length > 0 ? `(${files.length})` : ''}
        </Button>
      </div>
    );
  }

  // Classifying state
  if (pageState === 'classifying') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 gap-6">
        <div className="text-4xl animate-pulse">🔍</div>
        <h2 className="text-xl font-semibold text-center">Analyzing…</h2>
        <p className="text-muted-foreground text-sm text-center">{currentFile}</p>
        <div className="w-full max-w-xs bg-muted rounded-full h-2">
          <div className="bg-primary h-2 rounded-full animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  // Review state
  return (
    <div className="flex flex-col px-4 pt-6 pb-4 gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Review &amp; Save</h1>
        <Button variant="outline" size="sm" onClick={clearImports}>
          Import more
        </Button>
      </div>

      {fileResults.map((fr) => (
        <div key={fr.id} data-import-item={fr.id} className="space-y-2">
          {fr.warning && <p role="status" className="text-sm text-muted-foreground">{fr.warning}</p>}
          {fr.qr && !fr.saved && <div className="rounded-lg border p-3 space-y-2 text-sm">
            <p className="font-medium">QR code · {fr.file.name}</p>
            <p className="break-all whitespace-pre-wrap">{fr.qr.payload}</p>
            {fr.resolving && <p role="status">Reading linked details…</p>}
            {fr.resolveError && <><p className="text-muted-foreground">{fr.resolveError}</p><Button variant="outline" size="sm" onClick={() => enqueueQr(fr)}>Retry linked details</Button></>}
          </div>}
          {fr.saveError && <p role="alert" className="text-sm text-destructive">{fr.saveError}</p>}
          <fieldset disabled={fr.resolving || fr.saving} className="min-w-0 border-0 p-0">
            <ReviewCard fr={fr} onSave={() => handleSave(fr.id)} onDismiss={() => handleDismiss(fr.id)} onToggleEdit={() => toggleEdit(fr.id)} onUpdateField={(field, value) => updateEditedField(fr.id, field, value)} />
          </fieldset>
          {fr.qr && !fr.saved && <Button variant="ghost" size="sm" onClick={() => handleDismiss(fr.id)}>Dismiss QR</Button>}
        </div>
      ))}

      {fileResults.length === 0 && (
        <p className="text-muted-foreground text-center text-sm pt-8">All done!</p>
      )}
    </div>
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

function ReviewCard({ fr, onSave, onDismiss, onToggleEdit, onUpdateField }: ReviewCardProps) {
  if (fr.saved) {
    return (
      <Card className="border-green-500/40 bg-green-500/5">
        <CardContent className="pt-4 pb-4">
          <p className="text-green-600 font-medium text-sm">✓ {fr.savedMessage}</p>
          {fr.personKey && <Link href={`/person/${encodeURIComponent(btoa(fr.personKey))}`} className="text-sm underline">View contact →</Link>}
          {fr.savedMessage?.includes('Wallet') && (
            <Link href="/wallet" className="text-xs text-primary underline mt-1 block">
              View in Wallet →
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  if (fr.error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="pt-4 pb-4 flex flex-col gap-2">
          <p className="text-destructive text-sm">Error: {fr.error}</p>
          <Button variant="outline" size="sm" onClick={onDismiss}>Dismiss</Button>
        </CardContent>
      </Card>
    );
  }

  const result = fr.editedResult ?? fr.result;
  if (!result) return null;

  const isEditing = fr.editing ?? false;

  switch (result.kind) {
    case 'coupon':
      return (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">🎟 Coupon</CardTitle>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={onToggleEdit}>
                  {isEditing ? 'Done' : 'Edit'}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {isEditing ? (
              <>
                <div>
                  <Label className="text-xs">Code</Label>
                  <Input
                    value={result.code}
                    onChange={(e) => onUpdateField('code', e.target.value)}
                    className="font-mono text-lg font-bold mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Vendor</Label>
                  <Input value={result.vendor} onChange={(e) => onUpdateField('vendor', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Value</Label>
                  <Input value={result.value} onChange={(e) => onUpdateField('value', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea value={result.description} onChange={(e) => onUpdateField('description', e.target.value)} className="mt-1" rows={2} />
                </div>
                <div>
                  <Label className="text-xs">Expires (ISO date or blank)</Label>
                  <Input value={result.expires ?? ''} onChange={(e) => onUpdateField('expires', e.target.value || null)} className="mt-1" />
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-2xl font-bold tracking-wider bg-muted/60 rounded-lg px-3 py-2 text-center">
                  {result.code}
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium">{result.vendor}</span>
                  <Badge variant="secondary">{result.value}</Badge>
                </div>
                {result.description && (
                  <p className="text-sm text-muted-foreground">{result.description}</p>
                )}
                {result.expires && (
                  <p className="text-xs text-muted-foreground">Expires: {result.expires}</p>
                )}
              </>
            )}
            <Button className="w-full mt-1" onClick={onSave}>
              Save to Wallet
            </Button>
          </CardContent>
        </Card>
      );

    case 'slide':
    case 'deck':
      return (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">🖼 {result.kind === 'deck' ? 'Deck' : 'Slide'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={onToggleEdit}>
                {isEditing ? 'Done' : 'Edit'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {isEditing ? (
              <>
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input value={result.title} onChange={(e) => onUpdateField('title', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Speaker</Label>
                  <Input value={result.speaker} onChange={(e) => onUpdateField('speaker', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Ideas (one per line)</Label>
                  <Textarea
                    value={result.ideas.join('\n')}
                    onChange={(e) => onUpdateField('ideas', e.target.value.split('\n').filter(Boolean))}
                    className="mt-1"
                    rows={3}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="font-medium">{result.title}</p>
                {result.speaker && <p className="text-sm text-muted-foreground">by {result.speaker}</p>}
                {result.ideas.length > 0 && (
                  <ul className="text-sm list-disc list-inside space-y-1">
                    {result.ideas.map((idea, i) => <li key={i}>{idea}</li>)}
                  </ul>
                )}
                {result.topics.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {result.topics.map((t, i) => <Badge key={i} variant="outline">{t}</Badge>)}
                  </div>
                )}
              </>
            )}
            <Button className="w-full mt-1" onClick={onSave}>Save</Button>
          </CardContent>
        </Card>
      );

    case 'badge':
    case 'business_card':
      return (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">👤 {result.kind === 'badge' ? 'Badge' : 'Business Card'}</CardTitle>
              <Button variant="ghost" size="sm" onClick={onToggleEdit}>
                {isEditing ? 'Done' : 'Edit'}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {isEditing ? (
              <>
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input value={result.name} onChange={(e) => onUpdateField('name', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Company</Label>
                  <Input value={result.company} onChange={(e) => onUpdateField('company', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Title</Label>
                  <Input value={result.title} onChange={(e) => onUpdateField('title', e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label className="text-xs">LinkedIn URL</Label>
                  <Input value={result.linkedin_url} onChange={(e) => onUpdateField('linkedin_url', e.target.value)} className="mt-1" />
                </div>
                <div><Label className="text-xs">Email</Label><Input aria-label="Email" value={result.email} onChange={(e) => onUpdateField('email', e.target.value)} /></div>
                <div><Label className="text-xs">Phone</Label><Input aria-label="Phone" value={result.phone ?? ''} onChange={(e) => onUpdateField('phone', e.target.value)} /></div>
              </>
            ) : (
              <>
                <p className="font-semibold text-lg">{result.name}</p>
                <p className="text-sm text-muted-foreground">{result.title} @ {result.company}</p>
                {result.email && <p className="text-sm">{result.email}</p>}
                {result.phone && <p className="text-sm">{result.phone}</p>}
                {result.linkedin_url && (
                  <p className="text-xs text-primary truncate">{result.linkedin_url}</p>
                )}
              </>
            )}
            <Button className="w-full mt-1" onClick={onSave}>Add Person</Button>
          </CardContent>
        </Card>
      );

    case 'agenda':
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">📅 Agenda</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {result.sessions.map((s, i) => (
              <div key={i} className="text-sm border-l-2 border-primary/40 pl-3">
                <p className="font-medium">{s.title}</p>
                <p className="text-muted-foreground">{s.starts}{s.room ? ` · ${s.room}` : ''}{s.speaker ? ` · ${s.speaker}` : ''}</p>
              </div>
            ))}
            <Button className="w-full mt-1" onClick={onSave}>Save</Button>
          </CardContent>
        </Card>
      );

    default: {
      const other = result as { kind: string; text?: string };
      return (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">📄 {other.kind === 'qr' ? 'QR Code' : 'Other'}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {isEditing && fr.qr ? <Textarea aria-label="QR details" value={other.text ?? ''} onChange={(event) => onUpdateField('text', event.target.value)} /> : other.text && <p className="text-sm text-muted-foreground whitespace-pre-wrap break-all">{other.text}</p>}
            {fr.qr && <><Button variant="ghost" onClick={onToggleEdit}>{isEditing ? 'Done' : 'Edit'}</Button><Button onClick={onSave}>Save QR details</Button></>}
            <Button variant="outline" className="w-full" onClick={onDismiss}>Dismiss</Button>
          </CardContent>
        </Card>
      );
    }
  }
}
