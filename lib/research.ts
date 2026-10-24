import { serpSearch } from './brightdata';
import { jsonCompletion } from './openai';
import { writeContext, getContext } from './graph-writes';

const FRESHNESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function runResearch(
  personUrl: string,
  personName: string,
  companyName: string,
  graphName?: string,
): Promise<void> {
  try {
    // 1. Run 2 SERP searches
    const [search1, search2] = await Promise.allSettled([
      serpSearch(`"${personName}" "${companyName}"`),
      serpSearch(`"${companyName}" news`),
    ]);

    const results1 = search1.status === 'fulfilled' ? search1.value.slice(0, 5) : [];
    const results2 = search2.status === 'fulfilled' ? search2.value.slice(0, 5) : [];

    // 2. Deduplicate sources by URL
    const seen = new Set<string>();
    const allResults = [...results1, ...results2];
    const dedupedSources: { url: string; title: string; snippet: string }[] = [];
    for (const r of allResults) {
      if (!seen.has(r.url)) {
        seen.add(r.url);
        dedupedSources.push(r);
      }
    }

    if (dedupedSources.length === 0) {
      // Nothing to research
      return;
    }

    // 3. Call OpenAI to generate bullets
    const sourcesText = dedupedSources
      .map((s) => `[${s.title}](${s.url}): ${s.snippet}`)
      .join('\n');

    const completion = await jsonCompletion<{
      summary: string;
      bullets: { text: string; source_url: string }[];
    }>([
      {
        role: 'system',
        content:
          'Using only the provided sources, write 3-5 bullets a professional would want before following up with this person. Focus on: what they work on, company news, likely interests, a good follow-up angle. Return JSON: {"summary": string, "bullets": [{"text": string, "source_url": string}]}',
      },
      {
        role: 'user',
        content: `Person: ${personName} at ${companyName}\nSources:\n${sourcesText}`,
      },
    ]);

    const { summary, bullets } = completion;

    // 4. Write to graph
    await writeContext({
      personUrl,
      summary: summary ?? '',
      bullets: bullets ?? [],
      sources: dedupedSources.map((s) => ({ url: s.url, title: s.title })),
    }, graphName);
  } catch (err) {
    // Research is non-critical — log but don't throw
    console.error('[research] researchPerson failed:', err);
  }
}

export async function researchPerson(
  personUrl: string,
  personName: string,
  companyName: string,
  graphName?: string,
): Promise<void> {
  // Check freshness — skip if context is within 7 days
  try {
    const existing = await getContext(personUrl, graphName);
    if (existing && Date.now() - existing.fetched_at < FRESHNESS_MS) {
      return;
    }
  } catch {
    // If we can't read context, proceed with research
  }

  await runResearch(personUrl, personName, companyName, graphName);
}

export async function researchPersonForce(
  personUrl: string,
  personName: string,
  companyName: string,
  graphName?: string,
): Promise<void> {
  // Always runs — ignores 7-day freshness check
  await runResearch(personUrl, personName, companyName, graphName);
}
