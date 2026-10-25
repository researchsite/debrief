import { query, roQuery } from './graph';

// ────────────────────────────────────────────────────────────
// Session + Meet Plan graph writes
// ────────────────────────────────────────────────────────────

export interface SessionInput {
  title: string;
  starts: string;
  ends: string;
  room: string;
  abstract: string;
  eventName: string;
  speakerUrl?: string; // linkedin_url of the speaker Person node
}

export async function writeSession(input: SessionInput, graphName?: string): Promise<void> {
  const { title, starts, ends, room, abstract, eventName, speakerUrl } = input;

  await query(
    `MATCH (e:Event {name: $eventName})
     MERGE (s:Session {title: $title, eventName: $eventName})
     SET s.starts = $starts, s.ends = $ends, s.room = $room, s.abstract = $abstract
     MERGE (s)-[:PART_OF]->(e)`,
    { title, eventName, starts, ends, room, abstract },
    graphName,
  );

  if (speakerUrl) {
    await query(
      'MATCH (p:Person {linkedin_url: $speakerUrl}) MATCH (s:Session {title: $title, eventName: $eventName}) MERGE (p)-[:SPEAKS_AT]->(s)',
      { speakerUrl, title, eventName },
      graphName,
    );
  }
}

export interface PlanScore {
  personUrl: string;
  score: number;
  reasons: string[];
  via: string[]; // names of connecting people for warm-intro
  opener: string; // one-line opener from OpenAI
}

export async function writeMeetPlan(plans: PlanScore[], graphName?: string): Promise<void> {
  for (const plan of plans) {
    await query(
      `MATCH (me:Me) MATCH (p:Person {linkedin_url: $url})
       MERGE (me)-[r:PLANS_TO_MEET]->(p)
       SET r.score = $score, r.reasons = $reasons, r.via = $via, r.opener = $opener`,
      {
        url: plan.personUrl,
        score: plan.score,
        reasons: plan.reasons,
        via: plan.via,
        opener: plan.opener,
      },
      graphName,
    );
  }
}

export async function writeMet(personUrl: string, graphName?: string): Promise<void> {
  const timestamp = Date.now();
  await query(
    `MATCH (me:Me) MATCH (p:Person {linkedin_url: $url})
     MERGE (me)-[:MET {at: $timestamp}]->(p)`,
    { url: personUrl, timestamp },
    graphName,
  );
}

export interface MeetPlanEntry {
  name: string;
  headline: string;
  linkedinUrl: string;
  score: number;
  reasons: string[];
  via: string[];
  opener: string;
  sessionTitle?: string;
  company?: string;
}

export async function getMeetPlan(graphName?: string): Promise<MeetPlanEntry[]> {
  const result = await roQuery(
    `MATCH (me:Me)-[r:PLANS_TO_MEET]->(p:Person)
     OPTIONAL MATCH (p)-[:SPEAKS_AT]->(s:Session)
     OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
     RETURN p.name AS name, p.headline AS headline, coalesce(p.linkedin_url, p.id) AS linkedinUrl,
            r.score AS score, r.reasons AS reasons, r.via AS via, r.opener AS opener,
            s.title AS sessionTitle, c.name AS company
     ORDER BY r.score DESC LIMIT 20`,
    {},
    graphName,
  );

  return (result.data ?? []).map((row: Record<string, unknown>) => ({
    name: String(row.name ?? ''),
    headline: String(row.headline ?? ''),
    linkedinUrl: String(row.linkedinUrl ?? ''),
    score: Number(row.score ?? 0),
    reasons: Array.isArray(row.reasons) ? (row.reasons as string[]) : [],
    via: Array.isArray(row.via) ? (row.via as string[]) : [],
    opener: String(row.opener ?? ''),
    sessionTitle: row.sessionTitle != null ? String(row.sessionTitle) : undefined,
    company: row.company != null ? String(row.company) : undefined,
  }));
}

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

// ────────────────────────────────────────────────────────────
// Coupon / Asset graph writes
// ────────────────────────────────────────────────────────────

export interface CouponInput {
  code: string;
  vendor: string;
  value: string;
  description: string;
  expires: string | null;     // ISO date string or null
  terms: string;
  redeemUrl: string;
  assetPath: string;          // file path of the original upload
  eventName?: string;         // link to current event if known
}

export async function writeCoupon(input: CouponInput, graphName?: string): Promise<void> {
  const { code, vendor, value, description, expires, terms, redeemUrl, assetPath, eventName } = input;
  const now = Date.now();

  await query(
    `MERGE (coupon:Coupon {code: $code})
     SET coupon.vendor = $vendor, coupon.value = $value, coupon.description = $description,
         coupon.expires = $expires, coupon.terms = $terms, coupon.redeem_url = $redeemUrl,
         coupon.used = false, coupon.created_at = $now`,
    { code, vendor, value, description, expires: expires ?? null, terms, redeemUrl, now },
    graphName,
  );

  await query(
    `MERGE (company:Company {name: $vendor})
     WITH company
     MATCH (coupon:Coupon {code: $code})
     MERGE (coupon)-[:FROM]->(company)`,
    { vendor, code },
    graphName,
  );

  await query(
    `MERGE (asset:Asset {file_path: $assetPath})
     SET asset.kind = 'coupon', asset.extracted_text = $code
     WITH asset
     MATCH (coupon:Coupon {code: $code})
     MERGE (asset)-[:EXTRACTED]->(coupon)`,
    { assetPath, code },
    graphName,
  );

  if (eventName) {
    await query(
      `MATCH (e:Event {name: $eventName})
       MATCH (coupon:Coupon {code: $code})
       MERGE (coupon)-[:AT]->(e)`,
      { eventName, code },
      graphName,
    );
  }
}

export interface AssetInput {
  kind: 'slide' | 'deck' | 'coupon' | 'badge' | 'business_card' | 'agenda' | 'qr' | 'other';
  filePath: string;
  extractedText: string;
}

export async function writeAsset(input: AssetInput, graphName?: string): Promise<string> {
  const { kind, filePath, extractedText } = input;

  await query(
    `MERGE (a:Asset {file_path: $filePath})
     SET a.kind = $kind, a.extracted_text = $extractedText`,
    { filePath, kind, extractedText },
    graphName,
  );

  return filePath;
}

export interface CouponData {
  code: string;
  vendor: string;
  value: string;
  description: string;
  expires: string | null;
  terms: string;
  redeemUrl: string;
  used: boolean;
  assetPath: string;
}

export async function getCoupons(graphName?: string): Promise<CouponData[]> {
  const result = await roQuery(
    `MATCH (coupon:Coupon)
     OPTIONAL MATCH (coupon)-[:FROM]->(company:Company)
     OPTIONAL MATCH (asset:Asset)-[:EXTRACTED]->(coupon)
     RETURN coupon.code AS code,
            coalesce(company.name, coupon.vendor) AS vendor,
            coupon.value AS value,
            coupon.description AS description,
            coupon.expires AS expires,
            coupon.terms AS terms,
            coupon.redeem_url AS redeemUrl,
            coupon.used AS used,
            coalesce(asset.file_path, '') AS assetPath
     ORDER BY coupon.expires ASC`,
    {},
    graphName,
  );

  return (result.data ?? []).map((row: Record<string, unknown>) => ({
    code: String(row.code ?? ''),
    vendor: String(row.vendor ?? ''),
    value: String(row.value ?? ''),
    description: String(row.description ?? ''),
    expires: row.expires != null ? String(row.expires) : null,
    terms: String(row.terms ?? ''),
    redeemUrl: String(row.redeemUrl ?? ''),
    used: Boolean(row.used ?? false),
    assetPath: String(row.assetPath ?? ''),
  }));
}

export async function markCouponUsed(code: string, graphName?: string): Promise<void> {
  await query(
    'MATCH (c:Coupon {code: $code}) SET c.used = true',
    { code },
    graphName,
  );
}

// ────────────────────────────────────────────────────────────
// Transcript + Conversation graph writes
// ────────────────────────────────────────────────────────────

export interface TranscriptInput {
  filename: string;
  recordedAt: string;  // ISO date
  rawText: string;
}

export async function writeTranscript(input: TranscriptInput, graphName?: string): Promise<string> {
  const { filename, recordedAt, rawText } = input;
  await query(
    'MERGE (t:Transcript {filename: $filename}) SET t.recorded_at = $recordedAt, t.raw_text = $rawText',
    { filename, recordedAt, rawText },
    graphName,
  );
  return filename;
}

export interface ConversationSaveInput {
  transcriptFilename: string;
  personUrl: string;       // confirmed Person linkedin_url (may be a placeholder if new)
  personName: string;
  starts: number;
  ends: number;
  summary: string;
  keyPoints: string[];
  topics: string[];
  promises: string[];
  followUpNeeded: boolean;
  category?: string;
  isPrivate?: boolean;
}

export async function writeConversation(input: ConversationSaveInput, graphName?: string): Promise<void> {
  const {
    transcriptFilename,
    personUrl,
    personName,
    starts,
    ends,
    summary,
    keyPoints,
    topics,
    promises,
    followUpNeeded,
  } = input;

  const timestamp = Date.now();
  const noteText = [summary, ...keyPoints].join('\n');

  // 1. MERGE Conversation node
  await query(
    `MERGE (conv:Conversation {starts: $starts, ends: $ends})
     SET conv.summary = $summary, conv.excerpt = left($summary, 100), conv.category = $category,
         conv.is_private = $isPrivate`,
    { starts, ends, summary, category: input.category ?? 'other', isPrivate: input.isPrivate ?? true },
    graphName,
  );

  // 2. Link Transcript -> Conversation
  await query(
    `MATCH (t:Transcript {filename: $filename})
     MATCH (conv:Conversation {starts: $starts, ends: $ends})
     MERGE (t)-[:CONTAINS]->(conv)`,
    { filename: transcriptFilename, starts, ends },
    graphName,
  );

  // 3. MET edge from Me to Person
  await query(
    `MATCH (me:Me) MERGE (me)-[:MET {at: $starts}]->(p:Person {linkedin_url: $personUrl})`,
    { starts, personUrl },
    graphName,
  );

  // Also ensure person has a name set
  await query(
    `MERGE (p:Person {linkedin_url: $personUrl}) SET p.name = coalesce(p.name, $personName)`,
    { personUrl, personName },
    graphName,
  );

  // 4. Link Conversation -> Person
  await query(
    `MATCH (conv:Conversation {starts: $starts, ends: $ends})
     MATCH (p:Person {linkedin_url: $personUrl})
     MERGE (conv)-[:WITH]->(p)`,
    { starts, ends, personUrl },
    graphName,
  );

  // 5. Create Note from summary + key_points
  await query(
    `MATCH (conv:Conversation {starts: $starts, ends: $ends})
     MATCH (p:Person {linkedin_url: $personUrl})
     CREATE (n:Note {text: $noteText, created_at: $timestamp})
     MERGE (conv)-[:PRODUCED]->(n)
     MERGE (p)-[:HAS_NOTE]->(n)`,
    { starts, ends, personUrl, noteText, timestamp },
    graphName,
  );

  // 6. Topics
  for (const topic of topics) {
    await query(
      `MATCH (conv:Conversation {starts: $starts, ends: $ends})
       MERGE (tp:Topic {name: $topic})
       MERGE (conv)-[:MENTIONS]->(tp)`,
      { starts, ends, topic },
      graphName,
    );
  }

  // 7. FollowUp nodes for each promise
  if (followUpNeeded) {
    for (const promise of promises) {
      await query(
        `MATCH (me:Me)
         MATCH (p:Person {linkedin_url: $personUrl})
         MERGE (fu:FollowUp {message: $promise, status: 'todo'})
         MERGE (me)-[:FOLLOW_UP]->(fu)
         MERGE (fu)-[:FOR]->(p)`,
        { personUrl, promise },
        graphName,
      );
    }
  }
}

// ────────────────────────────────────────────────────────────
// Talk Notes graph writes + Today timeline reads
// ────────────────────────────────────────────────────────────

export interface TalkNoteInput {
  sessionTitle: string;
  speakerName: string;
  noteText: string;
  ideas: string[];       // extracted by OpenAI
  topics: string[];      // extracted by OpenAI, normalized lowercase
  eventName?: string;    // link to current event if known
  imageBase64?: string;  // optional slide photo (not stored in graph, only passed to OpenAI)
}

export async function writeTalkNote(input: TalkNoteInput, graphName?: string): Promise<void> {
  const { sessionTitle, speakerName, noteText, ideas, topics, eventName } = input;
  const timestamp = Date.now();

  // 1. MERGE Session node
  await query(
    'MERGE (s:Session {title: $title}) SET s.at = $timestamp, s.note = $note',
    { title: sessionTitle, timestamp, note: noteText },
    graphName,
  );

  // 2. If eventName: link Session to Event
  if (eventName) {
    await query(
      `MATCH (e:Event {name: $eventName})
       MATCH (s:Session {title: $title})
       MERGE (s)-[:PART_OF]->(e)`,
      { eventName, title: sessionTitle },
      graphName,
    );
  }

  // 3. MERGE speaker Person node
  await query(
    'MERGE (speaker:Person {name: $name})',
    { name: speakerName },
    graphName,
  );

  // 4. MERGE speaker SPEAKS_AT session
  await query(
    `MATCH (speaker:Person {name: $name})
     MATCH (s:Session {title: $title})
     MERGE (speaker)-[:SPEAKS_AT]->(s)`,
    { name: speakerName, title: sessionTitle },
    graphName,
  );

  // 5. MATCH Me -> SAW session
  await query(
    `MATCH (me:Me)
     MATCH (s:Session {title: $title})
     MERGE (me)-[:SAW]->(s)`,
    { title: sessionTitle },
    graphName,
  );

  // 6. For each idea: MERGE Idea + SPARKED edge
  for (const idea of ideas) {
    await query(
      `MATCH (s:Session {title: $title})
       MERGE (i:Idea {text: $idea})
       MERGE (s)-[:SPARKED]->(i)`,
      { title: sessionTitle, idea },
      graphName,
    );
  }

  // 7. For each topic: MERGE Topic + ABOUT edges (session and ideas)
  for (const topic of topics) {
    const normalized = topic.toLowerCase();
    await query(
      `MATCH (s:Session {title: $title})
       MERGE (t:Topic {name: $topic})
       MERGE (s)-[:ABOUT]->(t)`,
      { title: sessionTitle, topic: normalized },
      graphName,
    );

    // Also link each idea to the topic
    for (const idea of ideas) {
      await query(
        `MATCH (i:Idea {text: $idea})
         MERGE (t:Topic {name: $topic})
         MERGE (i)-[:ABOUT]->(t)`,
        { idea, topic: normalized },
        graphName,
      );
    }
  }
}

export interface TimelineEntry {
  type: 'person' | 'talk' | 'coupon';
  timestamp: number;
  title: string;
  subtitle: string;
  url?: string;   // link to /person/[url] or /wallet
  details?: string;
}

export async function getTodayTimeline(graphName?: string): Promise<TimelineEntry[]> {
  // Start of today in epoch ms (midnight UTC)
  const now = new Date();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  const entries: TimelineEntry[] = [];

  // 1. People MET today. Every capture writes its own MET edge, so collapse
  // them to one row per person at the most recent meeting time. The today
  // filter must sit on the MET match itself, not on the OPTIONAL MATCH.
  const metResult = await roQuery(
    `MATCH (me:Me)-[r:MET]->(p:Person)
     WHERE r.at > $todayStart
     WITH p, max(r.at) AS at
     OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
     WITH p, at, collect(c.name) AS companies
     RETURN p.name AS name, head(companies) AS company, at, coalesce(p.linkedin_url, p.id) AS url`,
    { todayStart },
    graphName,
  );
  for (const row of (metResult.data ?? []) as Record<string, unknown>[]) {
    entries.push({
      type: 'person',
      timestamp: Number(row.at ?? 0),
      title: String(row.name ?? 'Unknown'),
      subtitle: row.company ? String(row.company) : '',
      url: row.url ? `/person/${Buffer.from(String(row.url)).toString('base64url')}` : undefined,
    });
  }

  // 2. Sessions SAW today
  const sawResult = await roQuery(
    `MATCH (me:Me)-[:SAW]->(s:Session)
     WHERE s.at > $todayStart
     OPTIONAL MATCH (s)-[:SPARKED]->(i:Idea)
     RETURN s.title AS title, count(i) AS ideaCount, s.at AS at`,
    { todayStart },
    graphName,
  );
  for (const row of (sawResult.data ?? []) as Record<string, unknown>[]) {
    const ideaCount = Number(row.ideaCount ?? 0);
    entries.push({
      type: 'talk',
      timestamp: Number(row.at ?? 0),
      title: String(row.title ?? 'Unknown Talk'),
      subtitle: ideaCount === 1 ? '1 idea' : `${ideaCount} ideas`,
    });
  }

  // 3. Coupons created today
  const couponResult = await roQuery(
    `MATCH (c:Coupon)
     WHERE c.created_at > $todayStart
     RETURN c.code AS code, c.vendor AS vendor, c.created_at AS at`,
    { todayStart },
    graphName,
  );
  for (const row of (couponResult.data ?? []) as Record<string, unknown>[]) {
    entries.push({
      type: 'coupon',
      timestamp: Number(row.at ?? 0),
      title: String(row.code ?? 'Coupon'),
      subtitle: String(row.vendor ?? ''),
      url: '/wallet',
    });
  }

  // Sort newest first
  entries.sort((a, b) => b.timestamp - a.timestamp);

  return entries;
}

export async function getEventSummary(graphName?: string): Promise<{ eventName: string; primaryIntent: string } | null> {
  const result = await roQuery(
    `MATCH (me:Me)-[:ATTENDED]->(e:Event)
     MATCH (me)-[r:HAS_INTENT]->(i:Intent) WHERE r.primary = true
     RETURN e.name AS eventName, i.name AS primaryIntent,
            CASE WHEN e.url IS NOT NULL AND e.url <> '' THEN 0 ELSE 1 END AS priority
     ORDER BY priority LIMIT 1`,
    {},
    graphName,
  );

  const row = result.data?.[0];
  if (!row || row.eventName == null) return null;

  return {
    eventName: String(row.eventName),
    primaryIntent: String(row.primaryIntent ?? ''),
  };
}

// ────────────────────────────────────────────────────────────
// Recap data types + queries (M9)
// ────────────────────────────────────────────────────────────

export interface RecapCounts {
  peopleMet: number;
  sessionsSaw: number;
  ideas: number;
  connectedAndMet: number; // Me-CONNECTED-Person who I also MET
}

export interface RecapPerson {
  name: string;
  headline: string;
  linkedinUrl: string;
  company: string;
  noteText: string;
  contextBullets: ContextBullet[];
  contextFetched?: number;
}

export interface RecapIdea {
  text: string;
  sessionTitle: string;
  topics: string[];
}

export interface FollowUpDraft {
  personName: string;
  personUrl: string;
  company: string;
  message: string;
  noteSource: string;
  contextSource: string;
}

export async function getRecapCounts(graphName?: string): Promise<RecapCounts> {
  const [metR, sawR, ideasR, connMetR] = await Promise.all([
    roQuery('MATCH (me:Me)-[:MET]->(p:Person) RETURN count(p) AS cnt', {}, graphName),
    roQuery('MATCH (me:Me)-[:SAW]->(s:Session) RETURN count(s) AS cnt', {}, graphName),
    roQuery('MATCH (me:Me)-[:SAW]->(s:Session)-[:SPARKED]->(i:Idea) RETURN count(i) AS cnt', {}, graphName),
    roQuery('MATCH (me:Me)-[:CONNECTED]->(p:Person)<-[:MET]-(me) RETURN count(p) AS cnt', {}, graphName),
  ]);

  return {
    peopleMet: Number(metR.data?.[0]?.cnt ?? 0),
    sessionsSaw: Number(sawR.data?.[0]?.cnt ?? 0),
    ideas: Number(ideasR.data?.[0]?.cnt ?? 0),
    connectedAndMet: Number(connMetR.data?.[0]?.cnt ?? 0),
  };
}

export async function getRecapPeopleForIntent(
  intent: string,
  graphName?: string,
): Promise<RecapPerson[]> {
  let result;

  if (intent === 'job_hunt') {
    result = await roQuery(
      `MATCH (me:Me)-[:WANTS]->(r:Role)<-[:HIRING]-(c:Company)<-[:WORKS_AT]-(p:Person)<-[:MET]-(me)
       OPTIONAL MATCH (p)-[:HAS_NOTE]->(n:Note)
       OPTIONAL MATCH (p)-[:HAS_CONTEXT]->(ctx:Context)
       RETURN p.name AS name, p.headline AS headline, coalesce(p.linkedin_url, p.id) AS linkedinUrl,
              c.name AS company, n.text AS noteText, ctx.bullets AS ctxBullets,
              ctx.fetched_at AS ctxFetched
       LIMIT 10`,
      {},
      graphName,
    );
  } else if (intent === 'learning') {
    result = await roQuery(
      `MATCH (me:Me)-[:SAW]->(s:Session)<-[:SPEAKS_AT]-(p:Person)
       OPTIONAL MATCH (me)-[:MET]->(p)
       OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
       OPTIONAL MATCH (p)-[:HAS_NOTE]->(n:Note)
       OPTIONAL MATCH (p)-[:HAS_CONTEXT]->(ctx:Context)
       RETURN p.name AS name, p.headline AS headline, coalesce(p.linkedin_url, p.id) AS linkedinUrl,
              c.name AS company, n.text AS noteText, ctx.bullets AS ctxBullets,
              ctx.fetched_at AS ctxFetched
       LIMIT 10`,
      {},
      graphName,
    );
  } else {
    result = await roQuery(
      `MATCH (me:Me)-[:MET]->(p:Person)-[:WORKS_AT]->(c:Company)
       OPTIONAL MATCH (p)-[:HAS_NOTE]->(n:Note)
       OPTIONAL MATCH (p)-[:HAS_CONTEXT]->(ctx:Context)
       RETURN p.name AS name, p.headline AS headline, coalesce(p.linkedin_url, p.id) AS linkedinUrl,
              c.name AS company, n.text AS noteText, ctx.bullets AS ctxBullets,
              ctx.fetched_at AS ctxFetched
       LIMIT 10`,
      {},
      graphName,
    );
  }

  return (result.data ?? []).map((row: Record<string, unknown>) => {
    let contextBullets: ContextBullet[] = [];
    try {
      contextBullets = JSON.parse(String(row.ctxBullets ?? '[]')) as ContextBullet[];
    } catch {
      contextBullets = [];
    }
    return {
      name: String(row.name ?? ''),
      headline: String(row.headline ?? ''),
      linkedinUrl: String(row.linkedinUrl ?? ''),
      company: String(row.company ?? ''),
      noteText: String(row.noteText ?? ''),
      contextBullets,
      contextFetched: row.ctxFetched != null ? Number(row.ctxFetched) : undefined,
    };
  });
}

export async function getRecapIdeas(graphName?: string): Promise<RecapIdea[]> {
  const result = await roQuery(
    `MATCH (me:Me)-[:SAW]->(s:Session)-[:SPARKED]->(i:Idea)
     OPTIONAL MATCH (i)-[:ABOUT]->(t:Topic)
     RETURN i.text AS text, s.title AS sessionTitle, collect(t.name) AS topics`,
    {},
    graphName,
  );

  return (result.data ?? []).map((row: Record<string, unknown>) => ({
    text: String(row.text ?? ''),
    sessionTitle: String(row.sessionTitle ?? ''),
    topics: Array.isArray(row.topics) ? (row.topics as string[]) : [],
  }));
}

export async function saveFollowUp(fu: FollowUpDraft, graphName?: string): Promise<void> {
  // A generated draft belongs to a contact; the generated wording is mutable.
  // Keep the upsert and legacy cleanup atomic, including overlapping requests.
  await query(
    `MATCH (me:Me), (p:Person)
     WHERE coalesce(p.linkedin_url, p.id) = $url
     MERGE (me)-[:FOLLOW_UP]->(f:FollowUp {draft_for: $url})
     SET f.message = $message, f.status = 'todo',
       f.note_source = $noteSource, f.context_source = $contextSource
     MERGE (f)-[:FOR]->(p)
     WITH me, p, f
     OPTIONAL MATCH (me)-[:FOLLOW_UP]->(old:FollowUp)-[r:FOR]->(p)
     WHERE old <> f AND old.note_source IS NOT NULL AND old.context_source IS NOT NULL
     OPTIONAL MATCH (old)-[:FOR]->(other:Person) WHERE other <> p
     WITH old, r, count(other) AS otherRecipients
     FOREACH (obsolete IN CASE WHEN old IS NOT NULL AND otherRecipients = 0 THEN [old] ELSE [] END |
       DETACH DELETE obsolete)
     FOREACH (link IN CASE WHEN otherRecipients > 0 THEN [r] ELSE [] END | DELETE link)`,
    {
      url: fu.personUrl,
      message: fu.message,
      noteSource: fu.noteSource,
      contextSource: fu.contextSource,
    },
    graphName,
  );
}

export async function getFollowUps(
  graphName?: string,
): Promise<(FollowUpDraft & { status: string })[]> {
  const result = await roQuery(
    `MATCH (me:Me)-[:FOLLOW_UP]->(f:FollowUp)-[:FOR]->(p:Person)
     OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
     RETURN p.name AS personName, coalesce(p.linkedin_url, p.id) AS personUrl,
            head(collect(c.name)) AS company,
            f.message AS message, f.status AS status,
            f.note_source AS noteSource, f.context_source AS contextSource`,
    {},
    graphName,
  );

  return (result.data ?? []).map((row: Record<string, unknown>) => ({
    personName: String(row.personName ?? ''),
    personUrl: String(row.personUrl ?? ''),
    company: String(row.company ?? ''),
    message: String(row.message ?? ''),
    status: String(row.status ?? 'todo'),
    noteSource: String(row.noteSource ?? ''),
    contextSource: String(row.contextSource ?? ''),
  }));
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
}

export interface GraphLink {
  source: string;
  target: string;
  label: string;
}

export interface GraphPath {
  nodes: GraphNode[];
  links: GraphLink[];
}

export async function getWhyPath(personName: string, graphName?: string): Promise<GraphPath> {
  // Use a fallback approach: query 1-hop and 2-hop neighbors separately
  // to avoid complex path parsing from FalkorDB
  const nodesMap = new Map<string, GraphNode>();
  const linksSet = new Set<string>();
  const links: GraphLink[] = [];

  // Get the Me node
  const meResult = await roQuery(
    'MATCH (me:Me) RETURN id(me) AS nid, me.name AS name, labels(me) AS lbls LIMIT 1',
    {},
    graphName,
  );
  const meRow = meResult.data?.[0];
  if (!meRow) return { nodes: [], links: [] };
  const meId = String(meRow.nid ?? '0');
  const meName = String(meRow.name ?? 'Me');
  nodesMap.set(meId, { id: meId, label: meName, type: 'Me' });

  // Get the target person node
  const personResult = await roQuery(
    'MATCH (p:Person {name: $name}) RETURN id(p) AS nid, p.name AS pname, labels(p) AS lbls LIMIT 1',
    { name: personName },
    graphName,
  );
  const personRow = personResult.data?.[0];
  if (!personRow) return { nodes: [nodesMap.get(meId)!], links: [] };
  const personId = String(personRow.nid ?? '1');
  nodesMap.set(personId, { id: personId, label: personName, type: 'Person' });

  // Get direct relationships between Me and Person
  const directResult = await roQuery(
    `MATCH (me:Me)-[r]->(p:Person {name: $name})
     RETURN type(r) AS relType, id(me) AS srcId, id(p) AS dstId`,
    { name: personName },
    graphName,
  );
  for (const row of (directResult.data ?? []) as Record<string, unknown>[]) {
    const key = `${row.srcId}-${row.relType}-${row.dstId}`;
    if (!linksSet.has(key)) {
      linksSet.add(key);
      links.push({ source: String(row.srcId), target: String(row.dstId), label: String(row.relType ?? '') });
    }
  }

  // Get 2-hop neighbors of target person (companies, schools, topics, sessions)
  const neighborResult = await roQuery(
    `MATCH (p:Person {name: $name})-[r]->(n)
     WHERE NOT n:Me
     RETURN id(p) AS srcId, type(r) AS relType, id(n) AS dstId,
            labels(n) AS lbls, n.name AS nname, n.title AS ntitle, n.text AS ntext
     LIMIT 20`,
    { name: personName },
    graphName,
  );
  for (const row of (neighborResult.data ?? []) as Record<string, unknown>[]) {
    const nid = String(row.dstId ?? '');
    if (!nodesMap.has(nid)) {
      const lbls = Array.isArray(row.lbls) ? (row.lbls as string[]) : [];
      const nodeType = lbls[0] ?? 'Unknown';
      const nodeLabel = String(row.nname ?? row.ntitle ?? row.ntext ?? nodeType);
      nodesMap.set(nid, { id: nid, label: nodeLabel, type: nodeType });
    }
    const key = `${row.srcId}-${row.relType}-${row.dstId}`;
    if (!linksSet.has(key)) {
      linksSet.add(key);
      links.push({ source: String(row.srcId), target: String(row.dstId), label: String(row.relType ?? '') });
    }
  }

  // Also get neighbors of Me that connect to Person's company (warm intro paths)
  const meNeighborResult = await roQuery(
    `MATCH (me:Me)-[r]->(n)
     WHERE NOT n:Person OR n.name = $name
     RETURN id(me) AS srcId, type(r) AS relType, id(n) AS dstId,
            labels(n) AS lbls, n.name AS nname, n.title AS ntitle, n.text AS ntext
     LIMIT 20`,
    { name: personName },
    graphName,
  );
  for (const row of (meNeighborResult.data ?? []) as Record<string, unknown>[]) {
    const nid = String(row.dstId ?? '');
    if (!nodesMap.has(nid)) {
      const lbls = Array.isArray(row.lbls) ? (row.lbls as string[]) : [];
      const nodeType = lbls[0] ?? 'Unknown';
      const nodeLabel = String(row.nname ?? row.ntitle ?? row.ntext ?? nodeType);
      nodesMap.set(nid, { id: nid, label: nodeLabel, type: nodeType });
    }
    const key = `${row.srcId}-${row.relType}-${row.dstId}`;
    if (!linksSet.has(key)) {
      linksSet.add(key);
      links.push({ source: String(row.srcId), target: String(row.dstId), label: String(row.relType ?? '') });
    }
  }

  return {
    nodes: Array.from(nodesMap.values()),
    links,
  };
}

// ────────────────────────────────────────────────────────────
// Session retrieval (for schedule display + slide matching)
// ────────────────────────────────────────────────────────────

export interface StoredSession {
  title: string;
  starts: string;
  ends: string;
  room: string;
  abstract: string;
  speakerNames: string[];
}

export interface StoredEvent {
  name: string;
  date: string;
  venue: string;
  url: string;
}

export async function getStoredEvents(graphName?: string): Promise<StoredEvent[]> {
  const result = await roQuery(
    `MATCH (e:Event) WHERE e.name <> ''
     RETURN e.name AS name, e.date AS date, e.venue AS venue, e.url AS url
     ORDER BY name`,
    {},
    graphName,
  );
  return (result.data ?? []).map((row: Record<string, unknown>) => ({
    name: String(row.name ?? ''),
    date: String(row.date ?? ''),
    venue: String(row.venue ?? ''),
    url: String(row.url ?? ''),
  }));
}

export async function getStoredEvent(graphName?: string): Promise<StoredEvent | null> {
  const result = await roQuery(
    `MATCH (e:Event) WHERE e.name <> ''
     RETURN e.name AS name, e.date AS date, e.venue AS venue, e.url AS url,
            CASE WHEN e.url IS NOT NULL AND e.url <> '' THEN 0 ELSE 1 END AS priority
     ORDER BY priority, name LIMIT 1`,
    {},
    graphName,
  );
  const row = (result.data ?? [])[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    name: String(row.name ?? ''),
    date: String(row.date ?? ''),
    venue: String(row.venue ?? ''),
    url: String(row.url ?? ''),
  };
}

export async function getSessions(graphName?: string, eventName?: string): Promise<StoredSession[]> {
  const result = await roQuery(
    `MATCH (s:Session)-[:PART_OF]->(e:Event)
     ${eventName ? 'WHERE e.name = $eventName' : ''}
     OPTIONAL MATCH (p:Person)-[:SPEAKS_AT]->(s)
     RETURN s.title AS title, s.starts AS starts, s.ends AS ends,
            s.room AS room, s.abstract AS abstract,
            collect(p.name) AS speakerNames
     ORDER BY s.starts`,
    eventName ? { eventName } : {},
    graphName,
  );
  return (result.data ?? []).map((row: Record<string, unknown>) => ({
    title: String(row.title ?? ''),
    starts: String(row.starts ?? ''),
    ends: String(row.ends ?? ''),
    room: String(row.room ?? ''),
    abstract: String(row.abstract ?? ''),
    speakerNames: Array.isArray(row.speakerNames)
      ? (row.speakerNames as string[]).filter(Boolean)
      : [],
  }));
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
