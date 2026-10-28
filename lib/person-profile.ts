import { createHash, randomUUID } from 'node:crypto';
import { fetchProfiles } from './brightdata';
import { query, roQuery } from './graph';

export interface PersonProfile {
  id?: string;
  linkedin_url: string;
  name: string;
  headline: string;
  city: string;
  current_company: string;
  past_companies: string[];
  schools: string[];
  skills: string[];
  email?: string;
  phone?: string;
  photo_url?: string;
}

export function normalizeLinkedInUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || !(url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com'))) throw new Error('Please enter a LinkedIn profile URL.');
  const match = url.pathname.match(/^\/in\/([^/]+)\/?$/);
  if (!match) throw new Error('Please enter a LinkedIn profile URL.');
  return `https://www.linkedin.com/in/${match[1]}`;
}
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const row = object(value);
  for (const key of ['name', 'title', 'company', 'school', 'university', 'description']) if (typeof row[key] === 'string') return row[key].trim();
  return '';
}
function strings(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];
}
export function normalizeProfile(value: unknown, linkedinUrl: string): PersonProfile | null {
  const row = object(value);
  const name = text(row.name) || [text(row.first_name), text(row.last_name)].filter(Boolean).join(' ');
  if (!name || row.error) return null;
  const photoUrl = typeof row.photo_url === 'string' ? row.photo_url.trim()
    : typeof row.profile_pic_url === 'string' ? row.profile_pic_url.trim()
    : typeof row.profile_image_url === 'string' ? row.profile_image_url.trim()
    : typeof row.thumbnail === 'string' ? row.thumbnail.trim()
    : undefined;
  return {
    id: typeof row.id === 'string' ? row.id : undefined, linkedin_url: linkedinUrl, name,
    headline: text(row.headline) || text(row.position), city: text(row.city) || text(row.location),
    current_company: text(row.current_company),
    past_companies: strings(row.past_companies ?? (Array.isArray(row.experience) ? row.experience.map((entry) => object(entry).company) : [])),
    schools: strings(row.schools ?? row.education), skills: strings(row.skills), email: text(row.email), phone: text(row.phone),
    photo_url: photoUrl || undefined,
  };
}
export async function findStoredProfile(key: string, graphName?: string): Promise<PersonProfile | null> {
  const canonical = key.startsWith('http') ? normalizeLinkedInUrl(key) : '';
  const bare = canonical.replace('www.linkedin.com', 'linkedin.com');
  const urls = canonical ? [...new Set([key, canonical, canonical + '/', bare, bare + '/'])] : [];
  const result = await roQuery(
    `MATCH (p:Person) WHERE p.linkedin_url IN $urls OR p.id = $key
     OPTIONAL MATCH (p)-[:WORKS_AT]->(company:Company)
     OPTIONAL MATCH (p)-[:WORKED_AT]->(past:Company)
     OPTIONAL MATCH (p)-[:STUDIED_AT]->(school:School)
     OPTIONAL MATCH (p)-[:HAS_SKILL]->(skill:Skill)
     RETURN p.id AS id, p.linkedin_url AS linkedin_url, p.name AS name, p.headline AS headline,
       p.city AS city, p.email AS email, p.phone AS phone, p.photo_url AS photo_url,
       collect(DISTINCT company.name) AS companies,
       collect(DISTINCT past.name) AS past_companies, collect(DISTINCT school.name) AS schools,
       collect(DISTINCT skill.name) AS skills LIMIT 1`, { key, urls }, graphName,
  );
  const row = result.data?.[0];
  if (!row?.name) return null;
  return normalizeProfile({ ...row, current_company: Array.isArray(row.companies) ? row.companies[0] : '', photo_url: row.photo_url }, typeof row.linkedin_url === 'string' ? row.linkedin_url : canonical);
}
export async function resolvePersonProfile(url: string, signal?: AbortSignal, graphName?: string): Promise<PersonProfile | null> {
  const canonical = normalizeLinkedInUrl(url);
  const existing = await findStoredProfile(url, graphName);
  if (existing) return existing;
  const profiles = await fetchProfiles([canonical], { signal });
  return normalizeProfile(profiles[0], canonical);
}
/** Profile-only write: never creates a meeting or note. */
export async function upsertContactProfile(profile: PersonProfile, graphName?: string): Promise<string> {
  const url = profile.linkedin_url ? normalizeLinkedInUrl(profile.linkedin_url) : '';
  const existing = url ? await findStoredProfile(url, graphName) : null;
  const id = existing?.id || profile.id || (url ? `linkedin:${createHash('sha256').update(url).digest('hex')}` : `contact:${randomUUID()}`);
  const storedUrl = existing?.linkedin_url || url;
  const identity = storedUrl ? '{linkedin_url: $url}' : '{id: $id}';
  const props: Record<string, string> = {};
  for (const field of ['name', 'headline', 'city', 'email', 'phone', 'photo_url'] as const) if (profile[field]) props[field] = profile[field]!;
  if (!profile.name) throw new Error('A contact name is required.');
  await query(`MERGE (p:Person ${identity}) SET p.id = $id, p += $props`, { url: storedUrl, id, props }, graphName);
  const groups: [string, string, string[]][] = [
    ['Company', 'WORKS_AT', profile.current_company ? [profile.current_company] : []],
    ['Company', 'WORKED_AT', profile.past_companies], ['School', 'STUDIED_AT', profile.schools],
    ['Skill', 'HAS_SKILL', profile.skills.map((skill) => skill.toLowerCase())],
  ];
  for (const [label, relationship, names] of groups) if (names.length) await query(
    `MATCH (p:Person {id:$id}) UNWIND $names AS name MERGE (n:${label} {name:name}) MERGE (p)-[:${relationship}]->(n)`,
    { id, names: [...new Set(names.filter(Boolean))] }, graphName,
  );
  return id;
}
export async function captureMeeting(id: string, requestId: string, note: string, graphName?: string): Promise<void> {
  const result = await query(
    `MATCH (me:Me), (p:Person {id:$id})
     MERGE (me)-[met:MET {capture_id:$captureId}]->(p) ON CREATE SET met.at = $now
     MERGE (n:Note {capture_id:$captureId}) ON CREATE SET n.text = $note, n.created_at = $now
     MERGE (p)-[:HAS_NOTE]->(n) RETURN n.capture_id AS captureId`,
    { id, captureId: `${id}:${requestId}`, note, now: Date.now() }, graphName,
  );
  if (!result.data?.length) throw new Error('Set up your profile before adding a meeting.');
}
