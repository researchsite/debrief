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
    return urls.map((_, i) => fixtures[i % fixtures.length]);
  }

  const apiKey = process.env.BRIGHTDATA_API_KEY;

  // Submit batch job
  const submitRes = await fetch(
    'https://api.brightdata.com/datasets/v3/scrape?dataset_id=gd_l1viktl72bvl7bjuj0&format=json',
    {
      method: 'POST',
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
    await new Promise((r) => setTimeout(r, 5000));
    const progressRes = await fetch(
      `https://api.brightdata.com/datasets/v3/progress/${snapshotId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
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
    { headers: { Authorization: `Bearer ${apiKey}` } },
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

  const response = await fetch('https://api.brightdata.com/request', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      zone,
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      format: 'json',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Bright Data serpSearch failed: ${response.status} ${response.statusText}`,
    );
  }

  const result = (await response.json()) as { status_code: number; body: string };
  const html = result.body ?? '';
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
      format: 'json',
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Bright Data fetchPage failed: ${response.status} ${response.statusText}`,
    );
  }

  const result = (await response.json()) as { status_code: number; body: string };
  return result.body ?? '';
}

interface BDSerpOrganic {
  link?: string;
  title?: string;
  description?: string;
}
interface BDSerpResponse {
  organic?: BDSerpOrganic[];
}

function parseSerpHtml(body: string): SerpResult[] {
  try {
    const parsed = JSON.parse(body) as BDSerpResponse;
    return (parsed.organic ?? []).slice(0, 5).map((r) => ({
      url: r.link ?? '',
      title: r.title ?? '',
      snippet: r.description ?? '',
    }));
  } catch {
    return [];
  }
}
