import { NextResponse } from 'next/server';
import {
  getRecapCounts,
  getRecapPeopleForIntent,
  getRecapIdeas,
  getFollowUps,
  getEventSummary,
  type RecapCounts,
  type RecapPerson,
  type RecapIdea,
  type FollowUpDraft,
} from '@/lib/graph-writes';

interface RecapResponse {
  counts: RecapCounts;
  event: { eventName: string; primaryIntent: string } | null;
  people: RecapPerson[];
  ideas: RecapIdea[];
  followUps: (FollowUpDraft & { status: string })[];
}

export async function GET(): Promise<NextResponse<RecapResponse>> {
  const event = await getEventSummary('debrief');
  const primaryIntent = event?.primaryIntent ?? 'networking';

  const [counts, people, ideas, followUps] = await Promise.all([
    getRecapCounts('debrief'),
    getRecapPeopleForIntent(primaryIntent, 'debrief'),
    getRecapIdeas('debrief'),
    getFollowUps('debrief'),
  ]);

  return NextResponse.json({ counts, event, people, ideas, followUps });
}
