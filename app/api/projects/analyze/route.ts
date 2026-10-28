import { NextRequest, NextResponse } from 'next/server';
import { getHackProjects, getProjectAnalysis, writeProjectAnalysis, type ProjectAnalysis } from '@/lib/graph-writes';
import { jsonCompletion } from '@/lib/openai';

interface AnalyzeResponse { ok: boolean; analysis?: ProjectAnalysis; cached?: boolean; error?: string }

export async function GET(req: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  const src = req.nextUrl.searchParams.get('src') ?? '';
  if (!src) return NextResponse.json({ ok: false, error: 'src param required' }, { status: 400 });
  const analysis = await getProjectAnalysis(src, 'debrief');
  if (!analysis) return NextResponse.json({ ok: false, error: 'No analysis found.' }, { status: 404 });
  return NextResponse.json({ ok: true, analysis, cached: true });
}

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeResponse>> {
  try {
    const { src, eventName } = (await req.json()) as { src: string; eventName?: string };
    if (!src) return NextResponse.json({ ok: false, error: 'src required' }, { status: 400 });

    const projects = await getHackProjects(src, 'debrief');
    if (!projects.length) {
      return NextResponse.json({ ok: false, error: 'No projects found for this source.' }, { status: 404 });
    }

    const listing = projects
      .map((p, i) => {
        const parts = [`${i + 1}. ${p.name}${p.team ? ` (${p.team})` : ''}`];
        if (p.tags?.length) parts.push(`   Category: ${p.tags.join(', ')}`);
        parts.push(`   Tech: ${p.techStack.join(', ') || 'unknown'}`);
        if (p.description) parts.push(`   ${p.description}`);
        if (p.url) parts.push(`   URL: ${p.url}`);
        return parts.join('\n');
      })
      .join('\n\n');

    const result = await jsonCompletion<ProjectAnalysis>(
      [
        {
          role: 'system',
          content: `You are analysing a set of hackathon projects to find patterns and insights.
Return JSON with exactly these fields:
- common: array of 6-8 themes, tech choices, or problem spaces that appear across multiple projects (short phrases, e.g. "AI-powered automation", "Real-time collaboration")
- unique: array of 4-6 standout, innovative, or rare approaches worth highlighting (short phrases)
- summary: 3-4 sentence narrative on the overall landscape — what problems they solve, dominant patterns, quality bar
- topTech: array of up to 10 technology names that appear most frequently across projects (just the names, e.g. ["React", "Python", "OpenAI"])
- projectLinks: array of { name, url } for every project that has a URL (omit those without)`,
        },
        {
          role: 'user',
          content: `${projects.length} projects from: ${src}\n\n${listing}`,
        },
      ],
      { timeoutMs: 120_000 },
    );

    // Normalise
    const analysis: ProjectAnalysis = {
      common: Array.isArray(result.common) ? result.common : [],
      unique: Array.isArray(result.unique) ? result.unique : [],
      summary: String(result.summary ?? ''),
      topTech: Array.isArray(result.topTech) ? result.topTech : [],
      projectLinks: Array.isArray(result.projectLinks)
        ? result.projectLinks.filter((l) => l && l.url)
        : [],
    };

    // Persist to graph
    await writeProjectAnalysis(analysis, src, eventName || undefined, 'debrief');

    return NextResponse.json({ ok: true, analysis });
  } catch (err) {
    console.error('[POST /api/projects/analyze]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Analysis failed' },
      { status: 500 },
    );
  }
}
