import { NextRequest, NextResponse } from 'next/server';
import { jsonCompletion } from '@/lib/openai';
import { writeTalkNote, getEventSummary } from '@/lib/graph-writes';

interface RequestBody {
  title: string;
  speaker: string;
  note: string;
  imageBase64?: string;
  mimeType?: string;
}

interface ResponseBody {
  ok: boolean;
  ideas?: string[];
  topics?: string[];
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<ResponseBody>> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ ok: false, error: 'title is required' }, { status: 400 });
  }

  const { title, speaker = '', note = '', imageBase64, mimeType } = body;

  // 1. Extract ideas and topics via OpenAI
  let ideas: string[] = [];
  let topics: string[] = [];

  try {
    if (imageBase64 && mimeType) {
      const result = await jsonCompletion<{ ideas: string[]; topics: string[] }>([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract from this talk/slide. Return JSON: {"ideas": string[] (max 3, one sentence each), "topics": string[] (max 3, 1-3 words, lowercase)}. Note: ${note}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ]);
      ideas = (result.ideas ?? []).slice(0, 3);
      topics = (result.topics ?? []).slice(0, 3).map((t) => t.toLowerCase());
    } else {
      const result = await jsonCompletion<{ ideas: string[]; topics: string[] }>([
        {
          role: 'system',
          content:
            'Return JSON: {"ideas": string[] (max 3, one sentence each), "topics": string[] (max 3, 1-3 words, lowercase)}',
        },
        {
          role: 'user',
          content: note,
        },
      ]);
      ideas = (result.ideas ?? []).slice(0, 3);
      topics = (result.topics ?? []).slice(0, 3).map((t) => t.toLowerCase());
    }
  } catch {
    // OpenAI failed — fallback to empty, still save the session
    ideas = [];
    topics = [];
  }

  // 2. Get current event name if available
  let eventName: string | undefined;
  try {
    const summary = await getEventSummary('debrief');
    eventName = summary?.eventName;
  } catch {
    // ignore
  }

  // 3. Write talk note to graph
  // Support comma-separated multiple speakers; empty speaker is fine (no Person node created)
  const speakerList = speaker.trim()
    ? speaker.trim().split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
    : [''];

  await writeTalkNote({
    sessionTitle: title.trim(),
    speakerName: speakerList[0],
    noteText: note,
    ideas,
    topics,
    eventName,
  });

  // Additional speakers: add SPEAKS_AT + MET edges without duplicating notes/ideas
  for (const extra of speakerList.slice(1)) {
    await writeTalkNote({
      sessionTitle: title.trim(),
      speakerName: extra,
      noteText: '',
      ideas: [],
      topics: [],
      eventName,
    });
  }

  return NextResponse.json({ ok: true, ideas, topics });
}
