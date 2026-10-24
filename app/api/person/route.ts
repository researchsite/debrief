import { after, NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { getCommonGround } from '@/lib/graph-writes';
import { query } from '@/lib/graph';
import { captureMeeting, normalizeLinkedInUrl, resolvePersonProfile, upsertContactProfile, type PersonProfile } from '@/lib/person-profile';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request. Please retry.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ ok: false, error: 'Invalid request. Please retry.' }, { status: 400 });
  let url = '';
  try {
    if (body.linkedinUrl) url = normalizeLinkedInUrl(body.linkedinUrl);
    if (!url && !body.manual) throw new Error('A LinkedIn URL is required.');
    if (body.manual && (typeof body.manualName !== 'string' || !body.manualName.trim())) throw new Error('Name is required.');
  } catch {
    return NextResponse.json({ ok: false, error: 'Enter a valid LinkedIn profile URL, or a name when saving manually.' }, { status: 400 });
  }
  const note = typeof body.note === 'string' ? body.note : '';
  const requestId = typeof body.requestId === 'string' && body.requestId.length <= 200 ? body.requestId : randomUUID();
  try {
    let profile: PersonProfile | null;
    if (body.manual) {
      profile = { id: `contact:${requestId}`, linkedin_url: url, name: body.manualName.trim(), headline: '', city: '', current_company: typeof body.manualCompany === 'string' ? body.manualCompany.trim() : '', past_companies: [], schools: [], skills: [] };
    } else {
      try { profile = await resolvePersonProfile(url, AbortSignal.timeout(20_000)); }
      catch { return NextResponse.json({ ok: true, enrichmentFailed: true }); }
      if (!profile) return NextResponse.json({ ok: true, enrichmentFailed: true });
    }
    const id = await upsertContactProfile(profile);
    await captureMeeting(id, requestId, note);
    const warnings: string[] = [];
    let commonGround;
    try { commonGround = await getCommonGround(profile.linkedin_url || id); }
    catch { warnings.push('Person saved. Common ground is temporarily unavailable.'); }
    if (body.isHiring === true) {
      try { await query(`MATCH (me:Me)-[:WANTS]->(role:Role), (p:Person {id:$id})-[:WORKS_AT]->(c:Company) MERGE (c)-[:HIRING]->(role)`, { id }); }
      catch { warnings.push('Person saved. The hiring detail could not be updated.'); }
    }
    try {
      after(async () => {
        try {
          const { researchPerson } = await import('@/lib/research');
          if (profile.linkedin_url && profile.current_company) await researchPerson(profile.linkedin_url, profile.name, profile.current_company);
        } catch { /* Research cannot turn a saved meeting into a failed request. */ }
      });
    } catch { warnings.push('Person saved. Research is temporarily unavailable.'); }
    return NextResponse.json({ ok: true, person: { id, name: profile.name, headline: profile.headline, city: profile.city, linkedin_url: profile.linkedin_url }, commonGround, warnings });
  } catch (error) {
    console.error('[person] Meeting save failed:', error instanceof Error ? error.name : 'Unknown error');
    return NextResponse.json({ ok: false, error: 'Could not save this person. Your details are still here. Please retry.' }, { status: 503 });
  }
}
