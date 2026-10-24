import path from 'path';
import fs from 'fs';

export interface BDProfile {
  name: string;
  headline: string;
  linkedin_url: string;
  city: string;
  current_company: string;
  past_companies: string[];
  schools: string[];
  skills: string[];
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
export async function fetchProfiles(urls: string[]): Promise<BDProfile[]> {
  if (isMock) {
    const fixtures = readFixture<BDProfile[]>('profile.json');
    // Return one profile per url (cycle through fixtures)
    return urls.map((_, i) => fixtures[i % fixtures.length]);
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const response = await fetch(
    'https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1viktl72bvl7bjuj0&format=json',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(urls.map((url) => ({ url }))),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Bright Data fetchProfiles failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as BDProfile[];
  return data;
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

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      zone,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      format: 'raw',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Bright Data serpSearch failed: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();
  return parseSerpHtml(html);
}

/**
 * Fetch a web page via Bright Data's Web Unlocker.
 * In mock mode returns fixture event page HTML.
 */
export async function fetchPage(url: string): Promise<string> {
  if (isMock) {
    return readFixtureRaw('event_page.html');
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_UNLOCKER_ZONE ?? 'web_unlocker1';

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      zone,
      url,
      format: 'raw',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Bright Data fetchPage failed: ${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

/**
 * Parse top 5 SERP results from Google HTML.
 * This is a best-effort parser for the raw HTML response.
 */
function parseSerpHtml(html: string): SerpResult[] {
  const results: SerpResult[] = [];

  // Match <a href="..."><h3>...</h3></a> patterns typical in Google results
  const linkPattern =
    /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  const snippetPattern = /<span[^>]*class="[^"]*st[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

  let match: RegExpExecArray | null;
  const snippets: string[] = [];

  let snippetMatch: RegExpExecArray | null;
  while ((snippetMatch = snippetPattern.exec(html)) !== null) {
    snippets.push(snippetMatch[1].replace(/<[^>]+>/g, '').trim());
  }

  let idx = 0;
  while ((match = linkPattern.exec(html)) !== null && results.length < 5) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (url && title) {
      results.push({
        url,
        title,
        snippet: snippets[idx] ?? '',
      });
      idx++;
    }
  }

  return results.slice(0, 5);
}
