import { query } from './graph';

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

  // Create/update Intent nodes and relationships
  for (const intent of intents) {
    const isPrimary = intent === primaryIntent;
    await query(
      'MERGE (i:Intent {name: $intent}) SET i.primary = $isPrimary',
      { intent, isPrimary },
      graphName,
    );
    await query(
      'MATCH (me:Me {linkedin_url: $url}) MATCH (i:Intent {name: $intent}) MERGE (me)-[:HAS_INTENT]->(i)',
      { url: linkedinUrl, intent },
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

export async function writeLinkedInArchive(
  linkedinUrl: string,
  archive: LinkedInArchive,
  graphName?: string,
): Promise<void> {
  const { headline, currentCompany, pastCompanies, schools, skills } = archive;

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
