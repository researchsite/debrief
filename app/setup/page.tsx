'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { parseLinkedInCsv } from '../../lib/linkedin-csv';

const INTENTS = [
  { value: 'job_hunt', label: 'Job Hunting', emoji: '💼' },
  { value: 'hiring', label: 'Hiring', emoji: '🎯' },
  { value: 'learning', label: 'Learning', emoji: '📚' },
  { value: 'customers', label: 'Finding Customers', emoji: '🛒' },
  { value: 'fundraising', label: 'Fundraising', emoji: '💰' },
  { value: 'partnerships', label: 'Partnerships', emoji: '🤝' },
  { value: 'cofounder', label: 'Finding Co-Founder', emoji: '🧑‍💻' },
  { value: 'find_mentor', label: 'Find a Mentor', emoji: '🧭' },
  { value: 'mentoring', label: 'Mentoring Others', emoji: '🎓' },
  { value: 'speaking', label: 'Speaking Opportunities', emoji: '🎤' },
  { value: 'community', label: 'Community / DevRel', emoji: '🌐' },
  { value: 'open_source', label: 'Open Source', emoji: '🔓' },
  { value: 'market_research', label: 'Market Research', emoji: '📊' },
  { value: 'product_feedback', label: 'Product Feedback', emoji: '💬' },
  { value: 'vendor_eval', label: 'Vendor Evaluation', emoji: '🔍' },
  { value: 'content', label: 'Content / Press', emoji: '📰' },
  { value: 'relocation', label: 'Relocation', emoji: '✈️' },
  { value: 'networking', label: 'General Networking', emoji: '🔗' },
] as const;

type IntentValue = (typeof INTENTS)[number]['value'];

interface ImportResult {
  ok: boolean;
  companies: number;
  schools: number;
  skills: number;
}

export default function SetupPage() {
  const router = useRouter();

  // Section 1
  const [name, setName] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [targetRole, setTargetRole] = useState('');

  // Section 2
  const [eventName, setEventName] = useState('Patch the Conference Hackathon');
  const [eventDate, setEventDate] = useState('2026-10-24');

  // Section 3
  const [selectedIntents, setSelectedIntents] = useState<Set<IntentValue>>(new Set());
  const [primaryIntent, setPrimaryIntent] = useState<IntentValue | null>(null);

  // Section 4
  const profileRef = useRef<HTMLInputElement>(null);
  const positionsRef = useRef<HTMLInputElement>(null);
  const educationRef = useRef<HTMLInputElement>(null);
  const skillsRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);

  // Section 5: Connections import
  const connectionsRef = useRef<HTMLInputElement>(null);
  const [connectionsImporting, setConnectionsImporting] = useState(false);
  const [connectionsImported, setConnectionsImported] = useState<number | null>(null);
  const [connectionsError, setConnectionsError] = useState('');

  // Section 6
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function toggleIntent(value: IntentValue) {
    setSelectedIntents((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
        if (primaryIntent === value) setPrimaryIntent(null);
      } else {
        next.add(value);
      }
      return next;
    });
  }

  function setAsPrimary(e: React.MouseEvent, value: IntentValue) {
    e.stopPropagation();
    if (!selectedIntents.has(value)) return;
    setPrimaryIntent(value === primaryIntent ? null : value);
  }

  async function handleImport() {
    setImportError('');
    setImportResult(null);

    const hasFiles =
      profileRef.current?.files?.length ||
      positionsRef.current?.files?.length ||
      educationRef.current?.files?.length ||
      skillsRef.current?.files?.length;

    const hasZip = zipRef.current?.files?.length;

    if (!hasFiles && !hasZip) {
      setImportError('Please select at least one CSV file or a ZIP archive.');
      return;
    }

    if (!linkedinUrl) {
      setImportError('Please enter your LinkedIn URL above before importing.');
      return;
    }

    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('linkedinUrl', linkedinUrl);

      if (hasZip && zipRef.current?.files?.[0]) {
        // Extract CSVs from ZIP
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(zipRef.current.files[0]);
        const fileMap: Record<string, string> = {
          'Profile.csv': 'profileCsv',
          'Positions.csv': 'positionsCsv',
          'Education.csv': 'educationCsv',
          'Skills.csv': 'skillsCsv',
        };
        for (const [filename, field] of Object.entries(fileMap)) {
          // Search case-insensitively
          const entry = Object.keys(zip.files).find(
            (k) => k.split('/').pop()?.toLowerCase() === filename.toLowerCase(),
          );
          if (entry) {
            const text = await zip.files[entry].async('text');
            fd.append(field, new File([text], filename, { type: 'text/csv' }));
          }
        }
      } else {
        const append = (ref: React.RefObject<HTMLInputElement | null>, field: string) => {
          if (ref.current?.files?.[0]) fd.append(field, ref.current.files[0]);
        };
        append(profileRef, 'profileCsv');
        append(positionsRef, 'positionsCsv');
        append(educationRef, 'educationCsv');
        append(skillsRef, 'skillsCsv');
      }

      const res = await fetch('/api/import/profile', { method: 'POST', body: fd });
      const data = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        setImportError(data.error ?? 'Import failed');
      } else {
        setImportResult(data);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  async function handleConnectionsImport() {
    setConnectionsError('');
    setConnectionsImported(null);

    const file = connectionsRef.current?.files?.[0];
    if (!file) {
      setConnectionsError('Please select a Connections.csv file.');
      return;
    }

    setConnectionsImporting(true);
    try {
      const text = await file.text();
      const rows = parseLinkedInCsv<Record<string, string>>(text, 'First Name');

      if (rows.length === 0) {
        setConnectionsError('No rows found in the CSV. Make sure you uploaded the correct file.');
        return;
      }

      const BATCH_SIZE = 500;
      let totalImported = 0;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const res = await fetch('/api/connections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch }),
        });
        const data = (await res.json()) as { ok?: boolean; imported?: number; error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? 'Import failed');
        }
        totalImported += data.imported ?? 0;
        setConnectionsImported(totalImported);
      }
    } catch (err) {
      setConnectionsError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setConnectionsImporting(false);
    }
  }

  async function handleSave() {
    setSaveError('');

    if (!name.trim()) { setSaveError('Name is required.'); return; }
    if (!linkedinUrl.trim()) { setSaveError('LinkedIn URL is required.'); return; }
    if (!eventName.trim()) { setSaveError('Event name is required.'); return; }
    if (selectedIntents.size === 0) { setSaveError('Please select at least one intent.'); return; }

    const intentsArray = Array.from(selectedIntents);
    const primary = primaryIntent ?? intentsArray[0];

    setSaving(true);
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          linkedinUrl: linkedinUrl.trim(),
          eventName: eventName.trim(),
          eventDate,
          targetRole: targetRole.trim(),
          intents: intentsArray,
          primaryIntent: primary,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setSaveError(data.error ?? 'Save failed');
      } else {
        router.push('/today');
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-6 space-y-6 max-w-[420px] mx-auto">
      <h1 className="text-2xl font-bold tracking-tight">Setup your profile</h1>

      {/* Section 1: About you */}
      <section className="space-y-4 rounded-xl border border-border p-4 bg-card">
        <h2 className="text-base font-semibold">About you</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="name">
            Name <span className="text-destructive">*</span>
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Your full name"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="linkedin-url">
            LinkedIn URL <span className="text-destructive">*</span>
          </label>
          <input
            id="linkedin-url"
            type="url"
            required
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="https://www.linkedin.com/in/your-profile"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="target-role">
            Target role
          </label>
          <input
            id="target-role"
            type="text"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. Backend Engineer"
          />
        </div>
      </section>

      {/* Section 2: This event */}
      <section className="space-y-4 rounded-xl border border-border p-4 bg-card">
        <h2 className="text-base font-semibold">This event</h2>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="event-name">
            Event name <span className="text-destructive">*</span>
          </label>
          <input
            id="event-name"
            type="text"
            required
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="event-date">
            Event date
          </label>
          <input
            id="event-date"
            type="date"
            value={eventDate}
            onChange={(e) => setEventDate(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </section>

      {/* Section 3: Intents */}
      <section className="space-y-3 rounded-xl border border-border p-4 bg-card">
        <h2 className="text-base font-semibold">Why are you here?</h2>
        <p className="text-xs text-muted-foreground">
          Select all that apply. Tap ⭐ to mark your primary goal.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {INTENTS.map(({ value, label, emoji }) => {
            const selected = selectedIntents.has(value);
            const isPrimary = primaryIntent === value;
            return (
              <div
                key={value}
                role="checkbox"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => toggleIntent(value)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggleIntent(value)}
                className={`relative flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors text-sm cursor-pointer select-none ${
                  selected
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                <span className="text-base leading-none">{emoji}</span>
                <span className="leading-snug pr-5">{label}</span>
                {selected && (
                  <button
                    type="button"
                    onClick={(e) => setAsPrimary(e, value)}
                    className={`absolute top-1.5 right-1.5 text-base leading-none ${
                      isPrimary ? 'text-yellow-500' : 'text-muted-foreground/40 hover:text-yellow-400'
                    }`}
                    aria-label={isPrimary ? 'Primary intent' : 'Set as primary'}
                  >
                    ⭐
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {selectedIntents.size > 0 && !primaryIntent && (
          <p className="text-xs text-muted-foreground">
            Tap ⭐ on a card to mark your primary goal.
          </p>
        )}
      </section>

      {/* Section 4: LinkedIn Archive Import */}
      <section className="space-y-3 rounded-xl border border-border p-4 bg-card">
        <h2 className="text-base font-semibold">Import your LinkedIn archive</h2>
        <p className="text-xs text-muted-foreground">
          Optional but recommended. From LinkedIn: Settings → Data privacy → Get a
          copy of your data → Connections only. Upload the individual CSVs or the ZIP
          file.
        </p>

        <div className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              ZIP archive (or upload CSVs individually below)
            </label>
            <input
              ref={zipRef}
              type="file"
              accept=".zip"
              className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
            />
          </div>

          <p className="text-xs text-muted-foreground font-medium">— or individual files —</p>

          {[
            { ref: profileRef, label: 'Profile.csv' },
            { ref: positionsRef, label: 'Positions.csv' },
            { ref: educationRef, label: 'Education.csv' },
            { ref: skillsRef, label: 'Skills.csv' },
          ].map(({ ref, label }) => (
            <div key={label} className="space-y-0.5">
              <label className="text-xs font-medium text-muted-foreground">{label}</label>
              <input
                ref={ref}
                type="file"
                accept=".csv"
                className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
              />
            </div>
          ))}
        </div>

        {importError && (
          <p className="text-xs text-destructive">{importError}</p>
        )}

        {importResult && (
          <div className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            Imported {importResult.companies} companies, {importResult.schools} schools,{' '}
            {importResult.skills} skills
          </div>
        )}

        <button
          type="button"
          onClick={handleImport}
          disabled={importing}
          className="w-full rounded-lg bg-secondary text-secondary-foreground px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors"
        >
          {importing ? 'Importing…' : 'Import'}
        </button>
      </section>

      {/* Section 5: Import your connections */}
      <section className="space-y-3 rounded-xl border border-border p-4 bg-card">
        <h2 className="text-base font-semibold">Import your connections</h2>
        <p className="text-xs text-muted-foreground">
          Upload Connections.csv from your LinkedIn export. From LinkedIn: Settings &rarr; Data
          privacy &rarr; Get a copy of your data &rarr; Request Connections-only archive.
        </p>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Connections.csv</label>
          <input
            ref={connectionsRef}
            type="file"
            accept=".csv"
            className="w-full text-sm file:mr-2 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
          />
        </div>

        {connectionsError && (
          <p className="text-xs text-destructive">{connectionsError}</p>
        )}

        {connectionsImporting && (
          <div className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
            {connectionsImported !== null
              ? `Importing… ${connectionsImported} so far`
              : 'Importing…'}
          </div>
        )}

        {!connectionsImporting && connectionsImported !== null && (
          <div className="inline-flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800">
            Imported {connectionsImported} connections
          </div>
        )}

        <button
          type="button"
          onClick={handleConnectionsImport}
          disabled={connectionsImporting}
          className="w-full rounded-lg bg-secondary text-secondary-foreground px-4 py-2 text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors"
        >
          {connectionsImporting ? 'Importing…' : 'Import'}
        </button>
      </section>

      {/* Section 6: Save */}
      <section className="pb-4">
        {saveError && (
          <p className="mb-2 text-sm text-destructive">{saveError}</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold hover:bg-primary/80 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save & Start'}
        </button>
      </section>
    </div>
  );
}
