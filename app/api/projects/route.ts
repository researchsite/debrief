import { NextRequest, NextResponse } from 'next/server';
import { writeHackProject, getHackProjects, type HackProject } from '@/lib/graph-writes';
import { jsonCompletion } from '@/lib/openai';
import { fetchPage } from '@/lib/brightdata';

interface FetchBody { url: string; eventName?: string }
interface FetchResponse {
  ok: boolean; projects?: HackProject[]; count?: number;
  fetcher?: string; pages?: number; error?: string;
}

// ── HTML helpers ──────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, ' [LINK:$1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Extract the next pagination URL directly from raw HTML — more reliable than asking GPT.
function extractNextPageUrl(html: string, currentUrl: string): string | null {
  // rel="next" link element (most reliable standard)
  const relPatterns = [
    /<link[^>]+rel=["'][^"']*\bnext\b[^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*\bnext\b[^"']*["']/i,
    /<a[^>]+rel=["'][^"']*\bnext\b[^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<a[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*\bnext\b[^"']*["']/i,
  ];
  for (const pat of relPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      try { return new URL(m[1], currentUrl).href; } catch { /* skip */ }
    }
  }

  // ?page=N+1 or &page=N+1 in anchor hrefs
  let currentPage = 1;
  try {
    const u = new URL(currentUrl);
    const p = u.searchParams.get('page') ?? u.searchParams.get('p') ?? '';
    currentPage = parseInt(p) || 1;
  } catch { /* ignore */ }

  const next = currentPage + 1;
  const qPatterns = [
    new RegExp(`href=["']([^"']*[?&]page=${next}[^"']*)["']`, 'i'),
    new RegExp(`href=["']([^"']*[?&]p=${next}[^"']*)["']`, 'i'),
    new RegExp(`href=["']([^"'*/page/]*/page/${next}/?)["']`, 'i'),
  ];
  for (const pat of qPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      try { return new URL(m[1], currentUrl).href; } catch { /* skip */ }
    }
  }

  return null;
}

// ── GPT extraction (chunked for large pages) ──────────────────

const SYSTEM_PROMPT = `Extract every hackathon project from the page text.
For each project return:
  name        - project name (required, skip rows with no clear name)
  team        - team or author ('' if unknown)
  description - 1-2 sentences describing what it does
  techStack   - array of tech keywords (languages, frameworks, APIs, cloud services)
  tags        - 1-3 domain tags from: AI/ML, Healthcare, FinTech, Sustainability, Education, Gaming, Social, Productivity, Hardware, Web3, Developer Tools, Other
  demoUrl     - live demo URL if different from project page, else ''
  url         - project page link from [LINK:...] markers, else ''
Return JSON: { projects: [] }`;

type RawProject = Omit<HackProject, 'sourceUrl' | 'eventName'>;

async function extractChunk(chunk: string, sourceUrl: string): Promise<RawProject[]> {
  const result = await jsonCompletion<{ projects: Partial<RawProject>[] }>(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Listing URL: ${sourceUrl}\n\n${chunk}` },
    ],
    { timeoutMs: 120_000 },
  );
  return (result.projects ?? []).map((p) => ({
    name: String(p.name ?? '').trim(),
    team: String(p.team ?? '').trim(),
    description: String(p.description ?? '').trim(),
    techStack: Array.isArray(p.techStack) ? p.techStack.map(String) : [],
    tags: Array.isArray(p.tags) ? p.tags.map(String) : [],
    demoUrl: String(p.demoUrl ?? '').trim(),
    url: String(p.url ?? '').trim(),
  }));
}

// Split text into overlapping chunks so GPT sees complete project blocks.
const CHUNK_SIZE = 36_000;
const OVERLAP = 3_000;

async function extractAllFromText(
  text: string,
  sourceUrl: string,
  seenNames: Set<string>,
  eventName: string | undefined,
): Promise<HackProject[]> {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE - OVERLAP) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
    if (i + CHUNK_SIZE >= text.length) break;
  }

  const projects: HackProject[] = [];
  for (const chunk of chunks) {
    let raw: RawProject[] = [];
    try {
      raw = await extractChunk(chunk, sourceUrl);
    } catch (e) {
      console.warn('[projects] chunk extraction failed:', e);
      continue;
    }
    for (const p of raw) {
      const key = p.name.toLowerCase();
      if (!key || seenNames.has(key)) continue;
      seenNames.add(key);
      projects.push({ ...p, sourceUrl, eventName });
    }
  }
  return projects;
}

// ── Route handlers ────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse<FetchResponse>> {
  try {
    const body = (await req.json()) as FetchBody;
    const sourceUrl = (body.url ?? '').trim();
    const eventName = (body.eventName ?? '').trim() || undefined;

    if (!sourceUrl.startsWith('http')) {
      return NextResponse.json({ ok: false, error: 'A valid https URL is required.' }, { status: 400 });
    }

    const allProjects: HackProject[] = [];
    const seenNames = new Set<string>();
    let fetcher = 'brightdata';
    let pagesScanned = 0;
    let nextUrl: string | null = sourceUrl;

    while (nextUrl && pagesScanned < 5) {
      let html: string;
      try {
        html = await fetchPage(nextUrl, { signal: AbortSignal.timeout(50_000), renderJs: true });
        console.log(`[projects] BrightData OK — page ${pagesScanned + 1}: ${nextUrl}`);
      } catch (bdErr) {
        fetcher = 'plain-fetch';
        console.warn(`[projects] BrightData failed p${pagesScanned + 1}, fallback:`, bdErr);
        html = await fetch(nextUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Debrief/1.0)' },
          signal: AbortSignal.timeout(25_000),
        }).then((r) => r.text());
      }

      // Detect next page from raw HTML BEFORE stripping
      const nextPageFromHtml = extractNextPageUrl(html, nextUrl);

      const text = htmlToText(html);
      const pageProjects = await extractAllFromText(text, sourceUrl, seenNames, eventName);
      allProjects.push(...pageProjects);
      pagesScanned++;

      // Advance only if HTML had an explicit pagination link
      if (nextPageFromHtml && nextPageFromHtml !== nextUrl) {
        nextUrl = nextPageFromHtml;
      } else {
        nextUrl = null;
      }
    }

    for (const p of allProjects) {
      await writeHackProject(p, 'debrief');
    }

    return NextResponse.json({ ok: true, projects: allProjects, count: allProjects.length, fetcher, pages: pagesScanned });
  } catch (err) {
    console.error('[POST /api/projects]', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch projects' },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const src = req.nextUrl.searchParams.get('src') ?? '';
  if (!src) return NextResponse.json({ ok: false, error: 'src param required' }, { status: 400 });
  const projects = await getHackProjects(src, 'debrief');
  return NextResponse.json({ ok: true, projects });
}
