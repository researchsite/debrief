import { fetchPage, fetchProfiles, serpSearch } from './brightdata';
import { jsonCompletion } from './openai';
import { query, roQuery } from './graph';
import { writeSession, writeMeetPlan, writePerson } from './graph-writes';

export interface ExtractedEvent {
  name: string;
  date: string;
  venue: string;
}

export interface ExtractedSpeaker {
  name: string;
  title: string;
  company: string;
  linkedin_url: string;
}

export interface ExtractedSession {
  title: string;
  starts: string;
  ends: string;
  room: string;
  abstract: string;
  speakers: ExtractedSpeaker[];
}

export interface EventExtraction {
  event: ExtractedEvent;
  sessions: ExtractedSession[];
}

// ────────────────────────────────────────────────────────────
// HTML stripping helpers
// ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  // Remove <script> and <style> blocks with their content
  let stripped = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  stripped = stripped.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove all remaining HTML tags
  stripped = stripped.replace(/<[^>]+>/g, ' ');
  // Collapse whitespace
  stripped = stripped.replace(/\s+/g, ' ').trim();
  // Keep first 60,000 chars
  return stripped.slice(0, 60_000);
}

// ────────────────────────────────────────────────────────────
// Scoring helper
// ────────────────────────────────────────────────────────────

async function scorePerson(
  personUrl: string,
  graphName?: string,
): Promise<{ score: number; reasons: string[]; via: string[] }> {
  let score = 0;
  const reasons: string[] = [];
  const via: string[] = [];

  // Already connected (+5)
  const connected = await roQuery(
    'MATCH (me:Me)-[:CONNECTED]->(p:Person {linkedin_url: $url}) RETURN count(p) AS cnt',
    { url: personUrl },
    graphName,
  );
  if (Number(connected.data?.[0]?.cnt ?? 0) > 0) {
    score += 5;
    reasons.push('Already connected');
  }

  // Warm intro: my connection works at their company (+4)
  const warmIntro = await roQuery(
    `MATCH (me:Me)-[:CONNECTED]->(c:Person)-[:WORKS_AT]->(co:Company)<-[:WORKS_AT]-(p:Person {linkedin_url: $url})
     RETURN c.name AS via, co.name AS company LIMIT 3`,
    { url: personUrl },
    graphName,
  );
  if ((warmIntro.data ?? []).length > 0) {
    score += 4;
    (warmIntro.data as Record<string, unknown>[]).forEach((r) => {
      reasons.push(`Intro via ${r.via} at ${r.company}`);
      via.push(String(r.via));
    });
  }

  // Shared employer (+3)
  const sharedEmp = await roQuery(
    `MATCH (me:Me)-[:WORKS_AT|WORKED_AT]->(co:Company)<-[:WORKS_AT|WORKED_AT]-(p:Person {linkedin_url: $url})
     RETURN co.name AS name LIMIT 3`,
    { url: personUrl },
    graphName,
  );
  (sharedEmp.data ?? []).forEach((r: Record<string, unknown>) => {
    score += 3;
    reasons.push(`Both worked at ${r.name}`);
  });

  // Shared school (+2)
  const sharedSchool = await roQuery(
    `MATCH (me:Me)-[:STUDIED_AT]->(s:School)<-[:STUDIED_AT]-(p:Person {linkedin_url: $url})
     RETURN s.name AS name`,
    { url: personUrl },
    graphName,
  );
  (sharedSchool.data ?? []).forEach((r: Record<string, unknown>) => {
    score += 2;
    reasons.push(`Both attended ${r.name}`);
  });

  // Intent fit: company is hiring for my role (+3)
  const intentFit = await roQuery(
    `MATCH (me:Me)-[:WANTS]->(r:Role)<-[:HIRING]-(c:Company)<-[:WORKS_AT]-(p:Person {linkedin_url: $url})
     RETURN r.title AS role`,
    { url: personUrl },
    graphName,
  );
  (intentFit.data ?? []).forEach((r: Record<string, unknown>) => {
    score += 3;
    reasons.push(`${r.role} hiring`);
  });

  // Topic overlap (+1 per shared topic)
  const topicOverlap = await roQuery(
    `MATCH (me:Me)-[:HAS_SKILL|INTERESTED_IN]->(t)<-[:HAS_SKILL|INTERESTED_IN]-(p:Person {linkedin_url: $url})
     RETURN t.name AS name`,
    { url: personUrl },
    graphName,
  );
  (topicOverlap.data ?? []).forEach((r: Record<string, unknown>) => {
    score += 1;
    reasons.push(`Shared interest: ${r.name}`);
  });

  return { score, reasons, via };
}

// ────────────────────────────────────────────────────────────
// Main extraction function
// ────────────────────────────────────────────────────────────

export async function extractEventFromUrl(
  eventUrl: string,
  graphName?: string,
): Promise<EventExtraction> {
  // Step 1: Fetch page HTML
  const html = await fetchPage(eventUrl);

  // Step 2: Strip HTML
  const strippedHtml = stripHtml(html);

  // Step 3: Extract event data via OpenAI
  const extraction = await jsonCompletion<EventExtraction>([
    {
      role: 'system',
      content:
        'Extract event data from this HTML. Return JSON matching exactly: {event:{name,date,venue}, sessions:[{title,starts,ends,room,abstract,speakers:[{name,title,company,linkedin_url}]}]}. Use empty string for missing fields. Return valid JSON only.',
    },
    {
      role: 'user',
      content: strippedHtml,
    },
  ]);

  // Step 4: Resolve missing LinkedIn URLs via SERP search
  const allSpeakers = extraction.sessions.flatMap((s) => s.speakers);
  for (const speaker of allSpeakers) {
    if (!speaker.linkedin_url) {
      try {
        const serpResults = await serpSearch(
          `"${speaker.name}" "${speaker.company}" site:linkedin.com/in`,
        );
        const linkedinResult = serpResults.find((r) => r.url.includes('linkedin.com/in/'));
        if (linkedinResult) {
          speaker.linkedin_url = linkedinResult.url;
        }
      } catch {
        // SERP failed — leave linkedin_url empty
      }
    }
  }

  // Step 5: Fetch profiles in batch for all speakers with URLs
  const speakerUrls = allSpeakers
    .map((s) => s.linkedin_url)
    .filter((url): url is string => Boolean(url));

  let profiles: Awaited<ReturnType<typeof fetchProfiles>> = [];
  if (speakerUrls.length > 0) {
    try {
      profiles = await fetchProfiles(speakerUrls);
    } catch {
      // Profile fetch failed — continue without enrichment
    }
  }

  // Build a map from URL to profile
  const profileMap = new Map(speakerUrls.map((url, i) => [url, profiles[i]]));

  // Step 6: Write Event node
  await query(
    `MERGE (e:Event {name: $name})
     SET e.date = $date, e.url = $eventUrl, e.venue = $venue`,
    {
      name: extraction.event.name,
      date: extraction.event.date,
      eventUrl,
      venue: extraction.event.venue,
    },
    graphName,
  );

  // Write Person nodes and Sessions
  for (const session of extraction.sessions) {
    for (const speaker of session.speakers) {
      if (!speaker.linkedin_url) continue;

      const profile = profileMap.get(speaker.linkedin_url);
      await writePerson(
        {
          linkedinUrl: speaker.linkedin_url,
          name: profile?.name ?? speaker.name,
          headline: profile?.headline ?? `${speaker.title} at ${speaker.company}`,
          city: profile?.city ?? '',
          currentCompany: profile?.current_company ?? speaker.company,
          pastCompanies: profile?.past_companies ?? [],
          schools: profile?.schools ?? [],
          skills: profile?.skills ?? [],
          topics: [],
          noteText: '',
          isHiring: false,
        },
        graphName,
      );

      await writeSession(
        {
          title: session.title,
          starts: session.starts,
          ends: session.ends,
          room: session.room,
          abstract: session.abstract,
          eventName: extraction.event.name,
          speakerUrl: speaker.linkedin_url,
        },
        graphName,
      );
    }

    // Handle sessions with no speakers that have URLs
    const noUrlSpeakers = session.speakers.filter((s) => !s.linkedin_url);
    if (session.speakers.length === 0 || noUrlSpeakers.length === session.speakers.length) {
      // Write session without speaker link
      await writeSession(
        {
          title: session.title,
          starts: session.starts,
          ends: session.ends,
          room: session.room,
          abstract: session.abstract,
          eventName: extraction.event.name,
        },
        graphName,
      );
    }
  }

  // Step 7: Score all speakers
  const scoredSpeakers: Array<{
    speaker: ExtractedSpeaker;
    score: number;
    reasons: string[];
    via: string[];
  }> = [];

  for (const speaker of allSpeakers) {
    if (!speaker.linkedin_url) continue;
    const scoring = await scorePerson(speaker.linkedin_url, graphName);
    scoredSpeakers.push({ speaker, ...scoring });
  }

  // Step 8: Generate openers for top 15
  scoredSpeakers.sort((a, b) => b.score - a.score);
  const top15 = scoredSpeakers.slice(0, 15);

  const plans: import('./graph-writes').PlanScore[] = [];

  for (const item of top15) {
    let opener = '';
    try {
      const openerResult = await jsonCompletion<{ opener: string }>([
        {
          role: 'system',
          content:
            'Write a one-line conversation opener (max 15 words) based on these shared connections/interests. Be specific and natural.',
        },
        {
          role: 'user',
          content: `Person: ${item.speaker.name} at ${item.speaker.company}. Shared context: ${item.reasons.join(', ')}`,
        },
      ]);
      opener = openerResult.opener ?? '';
    } catch {
      // OpenAI failed — use empty string
      opener = '';
    }

    plans.push({
      personUrl: item.speaker.linkedin_url,
      score: item.score,
      reasons: item.reasons,
      via: item.via,
      opener,
    });
  }

  // Add remaining speakers (beyond top 15) without openers
  for (const item of scoredSpeakers.slice(15)) {
    plans.push({
      personUrl: item.speaker.linkedin_url,
      score: item.score,
      reasons: item.reasons,
      via: item.via,
      opener: '',
    });
  }

  // Step 9: Write meet plan
  if (plans.length > 0) {
    await writeMeetPlan(plans, graphName);
  }

  return extraction;
}
