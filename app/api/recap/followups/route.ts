import { NextRequest, NextResponse } from 'next/server';
import {
  getRecapPeopleForIntent,
  getEventSummary,
  saveFollowUp,
  type FollowUpDraft,
} from '@/lib/graph-writes';
import { jsonCompletion } from '@/lib/openai';

interface FollowUpResponse {
  ok: boolean;
  drafts?: FollowUpDraft[];
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<FollowUpResponse>> {
  try {
    const body = await req.json().catch(() => ({})) as { selectedUrls?: string[] };
    const selectedUrls: string[] | null = Array.isArray(body.selectedUrls) && body.selectedUrls.length > 0
      ? body.selectedUrls
      : null;

    const event = await getEventSummary('debrief');
    const primaryIntent = event?.primaryIntent ?? 'networking';

    const people = await getRecapPeopleForIntent(primaryIntent, 'debrief');

    let top10;
    if (selectedUrls) {
      // User explicitly chose — honour that selection in the given order
      const byUrl = new Map(people.map((p) => [p.linkedinUrl, p]));
      top10 = selectedUrls.map((u) => byUrl.get(u)).filter(Boolean) as typeof people;
    } else {
      // Auto-select: notes first, then intent matches, up to 10
      const withNote = people.filter((p) => p.noteText && p.noteText.trim().length >= 10);
      const seenUrls = new Set(withNote.map((p) => p.linkedinUrl));
      const intentFill = people.filter((p) => p.intentMatch && !seenUrls.has(p.linkedinUrl));
      top10 = [...withNote, ...intentFill].slice(0, 10);
    }

    const drafts: FollowUpDraft[] = [];

    for (const person of top10) {
      const contextText = person.contextBullets.map((b) => b.text).join('; ') || 'No research yet';
      const noteText = person.noteText || 'No note taken';

      let message: string;
      try {
        const result = await jsonCompletion<{ message: string }>([
          {
            role: 'system',
            content:
              'Write a short (2-3 sentence), specific follow-up message to send to this person after meeting at a conference. Label facts clearly: use [Your note] for things you personally observed, and [Researched] for background context. Be genuine and specific. Return JSON: {message: string}',
          },
          {
            role: 'user',
            content: `Person: ${person.name} at ${person.company}
Primary intent: ${primaryIntent}
[Your note]: ${noteText}
[Researched]: ${contextText}`,
          },
        ]);
        message = result.message;
      } catch {
        message = `Great meeting you at the event, ${person.name}! Would love to stay in touch.`;
      }

      const fu: FollowUpDraft = {
        personName: person.name,
        personUrl: person.linkedinUrl,
        company: person.company,
        message,
        noteSource: noteText,
        contextSource: contextText,
      };

      await saveFollowUp(fu, 'debrief');
      drafts.push(fu);
    }

    return NextResponse.json({ ok: true, drafts });
  } catch (err) {
    console.error('[POST /api/recap/followups]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
