// POST /api/transcripts/confirm
// Writes confirmed conversation extractions to the graph.
// Only called after the user reviews and confirms items — never auto-saves.

import { NextRequest, NextResponse } from 'next/server';
import { writeTranscript, writeConversation, writePerson } from '@/lib/graph-writes';
import type { ConversationExtraction } from '@/lib/transcript-extract';

interface ConfirmItem {
  index: number;
  personUrl: string;    // confirmed or new (placeholder)
  personName: string;
  starts: number;
  ends: number;
  extraction: ConversationExtraction;
  skip: boolean;
}

interface ConfirmRequest {
  filename: string;
  confirms: ConfirmItem[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as ConfirmRequest;
    const { filename, confirms } = body;

    if (!filename || !Array.isArray(confirms)) {
      return NextResponse.json({ ok: false, error: 'Invalid request body' }, { status: 400 });
    }

    let saved = 0;

    for (const confirm of confirms) {
      if (confirm.skip) continue;

      const { personUrl, personName, starts, ends, extraction } = confirm;

      // 1. Ensure the Person node exists (create if placeholder URL)
      if (personUrl.startsWith('placeholder:')) {
        await writePerson({
          linkedinUrl: personUrl,
          name: personName,
          headline: extraction.who.role ?? '',
          city: '',
          currentCompany: extraction.who.company ?? '',
          pastCompanies: [],
          schools: [],
          skills: [],
          topics: extraction.topics ?? [],
          noteText: extraction.summary ?? '',
          isHiring: false,
        });
      }

      // 2. Write the Transcript node
      await writeTranscript({
        filename,
        recordedAt: new Date().toISOString(),
        rawText: '',
      });

      // 3. Write the Conversation node and all relationships
      await writeConversation({
        transcriptFilename: filename,
        personUrl,
        personName,
        starts,
        ends,
        summary: extraction.summary ?? '',
        keyPoints: extraction.key_points ?? [],
        topics: extraction.topics ?? [],
        promises: extraction.promises ?? [],
        followUpNeeded: extraction.follow_up_needed ?? false,
      });

      // 4. Fire-and-forget background research (best effort)
      try {
        const baseUrl = req.nextUrl.origin;
        void fetch(`${baseUrl}/api/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personUrl }),
        });
      } catch {
        // Ignore research errors — it's fire-and-forget
      }

      saved++;
    }

    return NextResponse.json({ ok: true, saved });
  } catch (err) {
    console.error('[/api/transcripts/confirm]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
