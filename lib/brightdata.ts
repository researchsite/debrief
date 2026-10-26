import path from 'path';
import fs from 'fs';
import { setTimeout as delay } from 'node:timers/promises';

export interface BDProfile {
  name: string;
  headline: string;
  linkedin_url: string;
  city: string;
  current_company: string;
  past_companies: string[];
  schools: string[];
  skills: string[];
  photo_url?: string;
}

export interface SerpResult {
  url: string;
  title: string;
  snippet: string;
}

const isMock = process.env.BRIGHTDATA_MOCK === 'true';
const fixtureDir = path.join(process.cwd(), 'fixtures', 'brightdata');

function readFixture<T>(filename: string): T {
  const filePath = path.join(fixtureDir, filename);
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content) as T;
}

function readFixtureRaw(filename: string): string {
  const filePath = path.join(fixtureDir, filename);
  return fs.readFileSync(filePath, 'utf-8');
}

/**
 * Fetch LinkedIn profiles for the given URLs.
 * In mock mode returns fixture data from fixtures/brightdata/profile.json.
 */
export async function fetchProfiles(urls: string[], options: { signal?: AbortSignal } = {}): Promise<BDProfile[]> {
  if (isMock) {
    const fixtures = readFixture<BDProfile[]>('profile.json');
    return urls.map((_, i) => fixtures[i % fixtures.length]);
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const signal = options.signal ?? AbortSignal.timeout(60_000);

  // Submit batch job
  const submitRes = await fetch(
    'https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1viktl72bvl7bjuj0&format=json',
    {
      method: 'POST',
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(urls.map((url) => ({ url }))),
    },
  );

  if (!submitRes.ok) {
    throw new Error(`Bright Data fetchProfiles submit failed: ${submitRes.status} ${submitRes.statusText}`);
  }

  const submitted = (await submitRes.json()) as { snapshot_id?: string };
  const snapshotId = submitted.snapshot_id;

  // If synchronous response (no snapshot_id), treat as direct result
  if (!snapshotId) {
    return submitted as unknown as BDProfile[];
  }

  // Poll until ready (max 60s)
  for (let attempt = 0; attempt < 12; attempt++) {
    await delay(5000, undefined, { signal });
    const progressRes = await fetch(
      `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, signal },
    );
    const progress = (await progressRes.json()) as { status: string };
    if (progress.status === 'ready') break;
    if (progress.status === 'failed') {
      throw new Error(`Bright Data snapshot ${snapshotId} failed`);
    }
  }

  // Download results
  const downloadRes = await fetch(
    `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
    { headers: { Authorization: `Bearer ${apiKey}` }, signal },
  );

  if (!downloadRes.ok) {
    throw new Error(`Bright Data fetchProfiles download failed: ${downloadRes.status}`);
  }

  return (await downloadRes.json()) as BDProfile[];
}

/**
 * Run a SERP search via Bright Data.
 * In mock mode returns fixture data from fixtures/brightdata/serp.json.
 */
export async function serpSearch(
  query: string,
): Promise<SerpResult[]> {
  if (isMock) {
    return readFixture<SerpResult[]>('serp.json');
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_SERP_ZONE ?? 'serp_api1';

  const requestBody = {
    url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
    format: 'json',
  };
  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ zone, ...requestBody }),
  });

  if (!response.ok) {
    // Some Bright Data accounts do not have a dedicated SERP zone, while the
    // Web Unlocker zone is available. Fall back to its raw Google response so
    // research still works with the configured credentials.
    const fallbackZone = process.env.BRIGHTDATA_UNLOCKER_ZONE;
    if (!fallbackZone || response.status < 400) {
      throw new Error(`Bright Data serpSearch failed: ${response.status} ${response.statusText}`);
    }
    const fallback = await fetch('https://api.brightdata.com/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: fallbackZone, ...requestBody, format: 'raw' }),
    });
    if (!fallback.ok) throw new Error(`Bright Data research search failed: ${fallback.status} ${fallback.statusText}`);
    const fallbackBody = await fallback.text();
    const parsed = parseSerpHtml(fallbackBody);
    if (parsed.length > 0) return parsed;
    const text = fallbackBody.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? [{ url: requestBody.url, title: `Google results for ${query}`, snippet: text.slice(0, 4000) }] : [];
  }

  const result = (await response.json()) as { status_code: number; body: string | BDSerpResponse };
  return parseSerpHtml(result.body ?? '');
}

/**
 * Fetch a web page via Bright Data's Web Unlocker.
 * In mock mode returns fixture event page HTML.
 */
export async function fetchPage(
  url: string,
  options: { signal?: AbortSignal; renderJs?: boolean } = {},
): Promise<string> {
  if (isMock) {
    return readFixtureRaw('event_page.html');
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE ?? 'web_unlocker1';

  const body: Record<string, unknown> = { zone, url, format: 'json' };
  if (options.renderJs) body.render_js = true;

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    signal: options.signal ?? AbortSignal.timeout(40_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(
      `Bright Data fetchPage failed: ${response.status} ${response.statusText}`,
    );
  }

  const result = (await response.json()) as { status_code: number; body: string };
  if (result.status_code >= 400 || typeof result.body !== 'string' || !result.body.trim()) throw new Error('The linked page could not be read.');
  return result.body;
}

interface BDSerpOrganic {
  link?: string;
  title?: string;
  description?: string;
}
interface BDSerpResponse {
  organic?: BDSerpOrganic[];
}

function parseSerpHtml(body: string | BDSerpResponse): SerpResult[] {
  try {
    // Bright Data with format:'json' may return body as a pre-parsed object
    const parsed: BDSerpResponse = typeof body === 'string' ? JSON.parse(body) as BDSerpResponse : body;
    return (parsed.organic ?? []).slice(0, 5).map((r) => ({
      url: r.link ?? '',
      title: r.title ?? '',
      snippet: r.description ?? '',
    }));
  } catch {
    if (typeof body !== 'string') return [];
    const results: SerpResult[] = [];
    const headingPattern = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
    const hrefPattern = /href=\\?["']([^"']+)\\?["']/gi;
    for (const match of body.matchAll(headingPattern)) {
      const beforeHeading = body.slice(Math.max(0, (match.index ?? 0) - 2500), match.index ?? 0);
      const hrefs = [...beforeHeading.matchAll(hrefPattern)];
      const href = hrefs.at(-1)?.[1]?.replace(/\\"/g, '"') ?? '';
      const url = href.startsWith('/url?q=') ? decodeURIComponent(href.slice(7).split('&')[0]) : href;
      const title = match[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
      if (title && /^https?:\/\//.test(url)) results.push({ url, title, snippet: '' });
      if (results.length === 5) break;
    }
    return results;
  }
}
