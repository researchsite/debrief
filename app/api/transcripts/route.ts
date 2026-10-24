// POST /api/transcripts
// Accepts a multipart FormData with a single .vtt file.
// Note: audio transcription (m4a/mp3 -> VTT) is out of scope for this milestone.
// Returns a review payload for user confirmation before any graph writes occur.

import { NextRequest, NextResponse } from 'next/server';
import { parseVtt } from '@/lib/vtt-parser';
import { splitConversations } from '@/lib/vtt-splitter';
import { extractAllConversations } from '@/lib/transcript-extract';
import type { ConversationExtraction } from '@/lib/transcript-extract';
import { roQuery } from '@/lib/graph';

export interface ReviewItem {
  index: number;
  starts: number;
  ends: number;
  text: string;        // conversation text excerpt (first 300 chars)
  extraction: ConversationExtraction;
  candidates: { name: string; linkedinUrl: string; headline: string }[];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ ok: false, error: 'No .vtt file provided' }, { status: 400 });
    }

    const filename = (file as File).name;
    if (!filename.endsWith('.vtt')) {
      return NextResponse.json(
        { ok: false, error: 'Only .vtt files are supported. Audio transcription (m4a/mp3) is not yet supported.' },
        { status: 400 },
      );
    }

    const vttText = await (file as File).text();

    // Parse and split
    const cues = parseVtt(vttText);
    const chunks = splitConversations(cues);

    // Extract conversation metadata via OpenAI
    const extractions = await extractAllConversations(chunks);

    // For each extraction, look for candidate Person nodes in the graph
    const items: ReviewItem[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const extraction = extractions[i];
      const name = extraction.who.name ?? '';

      let candidates: { name: string; linkedinUrl: string; headline: string }[] = [];

      if (name) {
        // Split into parts for partial matching
        const parts = name.split(/\s+/).filter((p) => p.length > 1);
        const partialName = parts[parts.length - 1] ?? name; // last name

        try {
          const result = await roQuery(
            `MATCH (p:Person)
             WHERE toLower(p.name) CONTAINS toLower($name) OR toLower(p.name) CONTAINS toLower($partialName)
             RETURN p.name AS name, p.linkedin_url AS linkedinUrl, p.headline AS headline LIMIT 5`,
            { name, partialName },
          );

          candidates = (result.data ?? []).map((row: Record<string, unknown>) => ({
            name: String(row.name ?? ''),
            linkedinUrl: String(row.linkedinUrl ?? ''),
            headline: String(row.headline ?? ''),
          }));
        } catch {
          // If graph is unavailable, continue with empty candidates
          candidates = [];
        }
      }

      items.push({
        index: i,
        starts: chunk.starts,
        ends: chunk.ends,
        text: chunk.text.slice(0, 300),
        extraction,
        candidates,
      });
    }

    return NextResponse.json({ ok: true, items, filename });
  } catch (err) {
    console.error('[/api/transcripts]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 },
    );
  }
}
