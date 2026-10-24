import { query, roQuery } from './graph';

export interface SetupInput {
  name: string;
  linkedinUrl: string;
  eventName: string;
  eventDate: string; // ISO date string
  targetRole: string;
  intents: string[]; // e.g. ['job_hunt', 'learning']
  primaryIntent: string; // must be in intents
}

export async function writeSetup(
  input: SetupInput,
  graphName?: string,
): Promise<void> {
  const { name, linkedinUrl, eventName, eventDate, targetRole, intents, primaryIntent } =
    input;

  // Create/update Me node
  await query(
    'MERGE (me:Me {linkedin_url: $url}) SET me.name = $name',
    { url: linkedinUrl, name },
    graphName,
  );

  // Create/update Event node and relationship
  await query(
    'MERGE (e:Event {name: $eventName}) SET e.date = $eventDate',
    { eventName, eventDate },
    graphName,
  );
  await query(
    'MATCH (me:Me {linkedin_url: $url}) MATCH (e:Event {name: $eventName}) MERGE (me)-[:ATTENDED]->(e)',
    { url: linkedinUrl, eventName },
    graphName,
  );

  // Create/update Role node and relationship
  await query(
    'MERGE (r:Role {title: $role})',
    { role: targetRole },
    graphName,
  );
  await query(
    'MATCH (me:Me {linkedin_url: $url}) MATCH (r:Role {title: $role}) MERGE (me)-[:WANTS]->(r)',
    { url: linkedinUrl, role: targetRole },
    graphName,
  );

  // Create/update Intent nodes and relationships.
  // primary flag is stored on the HAS_INTENT relationship (not the shared Intent node)
  // to keep each user's primary independent of others sharing the same intent.
  for (const intent of intents) {
    const isPrimary = intent === primaryIntent;
    await query(
      'MERGE (i:Intent {name: $intent})',
      { intent },
      graphName,
    );
    await query(
      `MATCH (me:Me {linkedin_url: $url}) MATCH (i:Intent {name: $intent})
       MERGE (me)-[r:HAS_INTENT]->(i)
       SET r.primary = $isPrimary`,
      { url: linkedinUrl, intent, isPrimary },
      graphName,
    );
  }
}

export interface LinkedInArchive {
  headline?: string;
  currentCompany?: string;
  pastCompanies?: { name: string; title: string; started: string; ended: string }[];
  schools?: { name: string; degree?: string; started?: string; ended?: string }[];
  skills?: string[];
}

export interface PersonInput {
  linkedinUrl: string;
  name: string;
  headline: string;
  city: string;
  currentCompany: string;
  pastCompanies: string[];
  schools: string[];
  skills: string[];
  topics: string[];         // normalized lowercase, from OpenAI extraction
  noteText: string;         // user's raw note (never modified by AI)
  isHiring: boolean;        // if true, create (currentCompany)-[:HIRING]->(myTargetRole)
}

export async function writePerson(input: PersonInput, graphName?: string): Promise<void> {
  const {
    linkedinUrl,
    name,
    headline,
    city,
    currentCompany,
    pastCompanies,
    schools,
    skills,
    topics,
    noteText,
    isHiring,
  } = input;

  const timestamp = Date.now();

  // 1. Create/update Person node
  await query(
    'MERGE (p:Person {linkedin_url: $url}) SET p.name = $name, p.headline = $headline, p.city = $city',
    { url: linkedinUrl, name, headline, city },
    graphName,
  );

  // 2. MET edge from Me
  await query(
    'MATCH (me:Me) MATCH (p:Person {linkedin_url: $url}) MERGE (me)-[:MET {at: $timestamp}]->(p)',
    { url: linkedinUrl, timestamp },
    graphName,
  );

  // 3. Current company WORKS_AT
  if (currentCompany) {
    await query(
      'MERGE (c:Company {name: $company}) WITH c MATCH (p:Person {linkedin_url: $url}) MERGE (p)-[:WORKS_AT]->(c)',
      { company: currentCompany, url: linkedinUrl },
      graphName,
    );
  }

  // 4. Past companies WORKED_AT
  for (const company of pastCompanies) {
    await query(
      'MERGE (c:Company {name: $company}) WITH c MATCH (p:Person {linkedin_url: $url}) MERGE (p)-[:WORKED_AT]->(c)',
      { company, url: linkedinUrl },
      graphName,
    );
  }

  // 5. Schools STUDIED_AT
  for (const school of schools) {
    await query(
      'MERGE (s:School {name: $school}) WITH s MATCH (p:Person {linkedin_url: $url}) MERGE (p)-[:STUDIED_AT]->(s)',
      { school, url: linkedinUrl },
      graphName,
    );
  }

  // 6. Skills HAS_SKILL (lowercase)
  for (const skill of skills) {
    const normalized = skill.toLowerCase();
    await query(
      'MERGE (sk:Skill {name: $skill}) WITH sk MATCH (p:Person {linkedin_url: $url}) MERGE (p)-[:HAS_SKILL]->(sk)',
      { skill: normalized, url: linkedinUrl },
      graphName,
    );
  }

  // 7. Topics INTERESTED_IN (lowercase)
  for (const topic of topics) {
    const normalized = topic.toLowerCase();
    await query(
      'MERGE (t:Topic {name: $topic}) WITH t MATCH (p:Person {linkedin_url: $url}) MERGE (p)-[:INTERESTED_IN]->(t)',
      { topic: normalized, url: linkedinUrl },
      graphName,
    );
  }

  // 8. Note HAS_NOTE (CREATE, never MERGE — each note is unique)
  await query(
    'MATCH (p:Person {linkedin_url: $url}) CREATE (n:Note {text: $text, created_at: $timestamp}) MERGE (p)-[:HAS_NOTE]->(n)',
    { url: linkedinUrl, text: noteText, timestamp },
    graphName,
  );

  // 9. If isHiring: link company to the role Me WANTS
  if (isHiring) {
    await query(
      `MATCH (me:Me)-[:WANTS]->(r:Role)
       MATCH (p:Person {linkedin_url: $url})-[:WORKS_AT]->(c:Company)
       MERGE (c)-[:HIRING]->(r)`,
      { url: linkedinUrl },
      graphName,
    );
  }
}

export interface CommonGround {
  alreadyConnected: boolean;
  warmIntro: { via: string; company: string }[];
  sharedEmployers: string[];
  sharedSchools: string[];
  sharedTopics: string[];
}

export async function getCommonGround(personUrl: string, graphName?: string): Promise<CommonGround> {
  // Already connected?
  const connectedResult = await roQuery(
    'MATCH (me:Me)-[:CONNECTED]->(p:Person {linkedin_url: $url}) RETURN count(p) > 0 AS connected',
    { url: personUrl },
    graphName,
  );
  const alreadyConnected = Boolean(connectedResult.data?.[0]?.connected ?? false);

  // Warm intro: my connection works at this person's company
  const warmIntroResult = await roQuery(
    `MATCH (me:Me)-[:CONNECTED]->(c:Person)-[:WORKS_AT]->(co:Company)<-[:WORKS_AT]-(p:Person {linkedin_url: $url})
     RETURN c.name AS via, co.name AS company`,
    { url: personUrl },
    graphName,
  );
  const warmIntro = (warmIntroResult.data ?? []).map((row: Record<string, unknown>) => ({
    via: String(row.via ?? ''),
    company: String(row.company ?? ''),
  }));

  // Shared employer
  const sharedEmployersResult = await roQuery(
    `MATCH (me:Me)-[:WORKS_AT|WORKED_AT]->(co:Company)<-[:WORKS_AT|WORKED_AT]-(p:Person {linkedin_url: $url})
     RETURN co.name AS name`,
    { url: personUrl },
    graphName,
  );
  const sharedEmployers = (sharedEmployersResult.data ?? []).map((row: Record<string, unknown>) => String(row.name ?? ''));

  // Shared school
  const sharedSchoolsResult = await roQuery(
    `MATCH (me:Me)-[:STUDIED_AT]->(s:School)<-[:STUDIED_AT]-(p:Person {linkedin_url: $url})
     RETURN s.name AS name`,
    { url: personUrl },
    graphName,
  );
  const sharedSchools = (sharedSchoolsResult.data ?? []).map((row: Record<string, unknown>) => String(row.name ?? ''));

  // Shared topics
  const sharedTopicsResult = await roQuery(
    `MATCH (me:Me)-[:HAS_SKILL|INTERESTED_IN]->(t)<-[:HAS_SKILL|INTERESTED_IN]-(p:Person {linkedin_url: $url})
     RETURN t.name AS name`,
    { url: personUrl },
    graphName,
  );
  const sharedTopics = (sharedTopicsResult.data ?? []).map((row: Record<string, unknown>) => String(row.name ?? ''));

  return {
    alreadyConnected,
    warmIntro,
    sharedEmployers,
    sharedSchools,
    sharedTopics,
  };
}

// ────────────────────────────────────────────────────────────
// Context (AI-generated research) graph writes
// ────────────────────────────────────────────────────────────

export interface ContextBullet {
  text: string;
  source_url: string;
}

export interface ContextInput {
  personUrl: string;
  summary: string;
  bullets: ContextBullet[];
  sources: { url: string; title: string }[];
}

export async function writeContext(input: ContextInput, graphName?: string): Promise<void> {
  const { personUrl, summary, bullets, sources } = input;
  const fetchedAt = Date.now();

  // 1. Create/replace Context node
  await query(
    `MATCH (p:Person {linkedin_url: $url})
     MERGE (p)-[:HAS_CONTEXT]->(ctx:Context)
     SET ctx.summary = $summary,
         ctx.bullets = $bullets,
         ctx.fetched_at = $fetchedAt`,
    { url: personUrl, summary, bullets: JSON.stringify(bullets), fetchedAt },
    graphName,
  );

  // 2. Source citations
  for (const src of sources) {
    await query(
      `MATCH (p:Person {linkedin_url: $url})-[:HAS_CONTEXT]->(ctx:Context)
       MERGE (src:Source {url: $srcUrl})
       SET src.title = $srcTitle
       MERGE (ctx)-[:CITES]->(src)`,
      { url: personUrl, srcUrl: src.url, srcTitle: src.title },
      graphName,
    );
  }
}

export interface ContextResult {
  summary: string;
  bullets: ContextBullet[];
  fetched_at: number;
  sources: { url: string; title: string }[];
}

export async function getContext(personUrl: string, graphName?: string): Promise<ContextResult | null> {
  const result = await roQuery(
    `MATCH (p:Person {linkedin_url: $url})-[:HAS_CONTEXT]->(ctx:Context)
     OPTIONAL MATCH (ctx)-[:CITES]->(src:Source)
     RETURN ctx.summary AS summary, ctx.bullets AS bullets, ctx.fetched_at AS fetched_at,
            collect({ url: src.url, title: src.title }) AS sources`,
    { url: personUrl },
    graphName,
  );

  const row = result.data?.[0];
  if (!row || row.summary == null) return null;

  let bullets: ContextBullet[] = [];
  try {
    bullets = JSON.parse(String(row.bullets ?? '[]')) as ContextBullet[];
  } catch {
    bullets = [];
  }

  // Filter out null/empty sources that come from OPTIONAL MATCH when no src exists
  const sources = ((row.sources as { url: string; title: string }[]) ?? []).filter(
    (s) => s.url != null,
  );

  return {
    summary: String(row.summary ?? ''),
    bullets,
    fetched_at: Number(row.fetched_at ?? 0),
    sources,
  };
}

export async function writeLinkedInArchive(
  linkedinUrl: string,
  archive: LinkedInArchive,
  graphName?: string,
): Promise<void> {
  const { headline, currentCompany, pastCompanies, schools, skills } = archive;

  // Upsert Me node to ensure it exists even if called before writeSetup.
  await query(
    'MERGE (me:Me {linkedin_url: $url})',
    { url: linkedinUrl },
    graphName,
  );

  // Update headline
  if (headline !== undefined) {
    await query(
      'MATCH (me:Me {linkedin_url: $url}) SET me.headline = $headline',
      { url: linkedinUrl, headline },
      graphName,
    );
  }

  // Current company
  if (currentCompany) {
    await query(
      'MERGE (c:Company {name: $name})',
      { name: currentCompany },
      graphName,
    );
    await query(
      'MATCH (me:Me {linkedin_url: $url}) MATCH (c:Company {name: $name}) MERGE (me)-[:WORKS_AT]->(c)',
      { url: linkedinUrl, name: currentCompany },
      graphName,
    );
  }

  // Past companies
  if (pastCompanies) {
    for (const company of pastCompanies) {
      await query(
        'MERGE (c:Company {name: $name})',
        { name: company.name },
        graphName,
      );
      await query(
        `MATCH (me:Me {linkedin_url: $url})
         MATCH (c:Company {name: $name})
         MERGE (me)-[r:WORKED_AT {started: $started, ended: $ended, title: $title}]->(c)`,
        { url: linkedinUrl, name: company.name, started: company.started, ended: company.ended, title: company.title },
        graphName,
      );
    }
  }

  // Schools
  if (schools) {
    for (const school of schools) {
      await query(
        'MERGE (s:School {name: $name})',
        { name: school.name },
        graphName,
      );
      await query(
        `MATCH (me:Me {linkedin_url: $url})
         MATCH (s:School {name: $name})
         MERGE (me)-[r:STUDIED_AT {degree: $degree, started: $started, ended: $ended}]->(s)`,
        {
          url: linkedinUrl,
          name: school.name,
          degree: school.degree ?? '',
          started: school.started ?? '',
          ended: school.ended ?? '',
        },
        graphName,
      );
    }
  }

  // Skills — normalize to lowercase
  if (skills) {
    for (const skill of skills) {
      const normalized = skill.toLowerCase();
      await query(
        'MERGE (sk:Skill {name: $skill})',
        { skill: normalized },
        graphName,
      );
      await query(
        'MATCH (me:Me {linkedin_url: $url}) MATCH (sk:Skill {name: $skill}) MERGE (me)-[:HAS_SKILL]->(sk)',
        { url: linkedinUrl, skill: normalized },
        graphName,
      );
    }
  }
}
