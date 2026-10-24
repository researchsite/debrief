import { NextRequest, NextResponse } from 'next/server';
import { fetchProfiles } from '@/lib/brightdata';
import { jsonCompletion } from '@/lib/openai';
import { writePerson, getCommonGround, type CommonGround } from '@/lib/graph-writes';

interface RequestBody {
  linkedinUrl: string;
  note: string;
  isHiring: boolean;
}

interface ResponseBody {
  ok: boolean;
  person?: { name: string; headline: string; city: string; linkedin_url: string };
  commonGround?: CommonGround;
  enrichmentFailed?: boolean;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<ResponseBody>> {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.linkedinUrl) {
    return NextResponse.json({ ok: false, error: 'linkedinUrl is required' }, { status: 400 });
  }

  const { linkedinUrl, note = '', isHiring = false } = body;

  // 1. Fetch profile from Bright Data (mock in dev)
  let profile: Awaited<ReturnType<typeof fetchProfiles>>[number];
  try {
    const profiles = await fetchProfiles([linkedinUrl]);
    profile = profiles[0];
    if (!profile) {
      return NextResponse.json({ ok: true, enrichmentFailed: true });
    }
  } catch {
    // Bright Data failure — return enrichmentFailed so UI can show manual fallback
    return NextResponse.json({ ok: true, enrichmentFailed: true });
  }

  // 2. Extract topics from headline + note via OpenAI
  let topics: string[] = [];
  try {
    const result = await jsonCompletion<{ topics: string[] }>([
      {
        role: 'system',
        content:
          'Return JSON: {"topics": string[]} — extract 1-3 topic keywords (normalized lowercase, 1-3 words each) from this professional headline and conversation note.',
      },
      {
        role: 'user',
        content: `Headline: ${profile.headline}\nNote: ${note}`,
      },
    ]);
    topics = (result.topics ?? []).map((t) => t.toLowerCase());
  } catch {
    // OpenAI not available or failed — default to empty
    topics = [];
  }

  // 3. Write person to graph
  await writePerson({
    linkedinUrl,
    name: profile.name,
    headline: profile.headline,
    city: profile.city,
    currentCompany: profile.current_company,
    pastCompanies: profile.past_companies ?? [],
    schools: profile.schools ?? [],
    skills: profile.skills ?? [],
    topics,
    noteText: note,
    isHiring,
  });

  // 4. Get common ground
  const commonGround = await getCommonGround(linkedinUrl);

  // 5. Fire-and-forget research (non-blocking)
  void fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'}/api/research`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ personUrl: linkedinUrl }),
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    person: {
      name: profile.name,
      headline: profile.headline,
      city: profile.city,
      linkedin_url: profile.linkedin_url,
    },
    commonGround,
  });
}
