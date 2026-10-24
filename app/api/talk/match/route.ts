import { NextRequest, NextResponse } from 'next/server';
import { classifyImage } from '@/lib/classify';
import { getSessions, type StoredSession } from '@/lib/graph-writes';
import { formatImportText } from '@/lib/import-text';

interface RequestBody {
  imageBase64: string;
  mimeType: string;
}

export interface SessionMatch {
  title: string;
  starts: string;
  ends: string;
  room: string;
  speakerNames: string[];
  score: number;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const word of a) {
    if (b.has(word)) count++;
  }
  return count;
}

function scoreSession(session: StoredSession, slideKeywords: Set<string>): number {
  const sessionText = [session.title, session.abstract, ...session.speakerNames].join(' ');
  const sessionTokens = tokenize(sessionText);
  return overlapScore(slideKeywords, sessionTokens);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.imageBase64 || !body.mimeType) {
    return NextResponse.json({ ok: false, error: 'imageBase64 and mimeType required' }, { status: 400 });
  }

  // Classify the slide — get topics/ideas/text even from mid-talk content slides
  let slideKeywords = new Set<string>();
  try {
    const classified = await classifyImage(body.imageBase64, body.mimeType);
    const textParts: string[] = [];
    if ('title' in classified && classified.title) textParts.push(classified.title);
    if ('topics' in classified && Array.isArray(classified.topics)) textParts.push(...classified.topics);
    if ('ideas' in classified && Array.isArray(classified.ideas)) textParts.push(...classified.ideas);
    if ('text' in classified && classified.text) {
      const text = formatImportText(classified.text);
      if (text) textParts.push(text);
    }
    slideKeywords = tokenize(textParts.join(' '));
  } catch {
    // If classify fails, fall back to showing all sessions unsorted
  }

  // Get all sessions from graph
  const sessions = await getSessions('debrief');

  if (sessions.length === 0) {
    return NextResponse.json({ ok: true, matches: [] });
  }

  // Score and rank
  const scored = sessions
    .map((s) => ({ ...s, score: scoreSession(s, slideKeywords) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return NextResponse.json({ ok: true, matches: scored });
}
