import { NextResponse } from 'next/server';
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

export async function POST(): Promise<NextResponse<FollowUpResponse>> {
  try {
    const event = await getEventSummary('debrief');
    const primaryIntent = event?.primaryIntent ?? 'networking';

    const people = await getRecapPeopleForIntent(primaryIntent, 'debrief');
    // Notes, companies, and meeting edges can produce several rows per contact.
    const seen = new Set<string>();
    const top5 = people.filter((person) => {
      if (!person.linkedinUrl || seen.has(person.linkedinUrl)) return false;
      seen.add(person.linkedinUrl);
      return true;
    }).slice(0, 5);

    const drafts: FollowUpDraft[] = [];

    for (const person of top5) {
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
