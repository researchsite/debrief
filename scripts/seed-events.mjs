/**
 * Re-seed event data into FalkorDB from local _private/events/*.json files.
 * Runs fully offline — no OpenAI, no Bright Data, no URL re-entry needed.
 *
 * Usage:
 *   node scripts/seed-events.mjs
 *   node scripts/seed-events.mjs --graph debrief_test   (different graph)
 */

import { FalkorDB } from 'falkordb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVENTS_DIR = path.join(__dirname, '..', '_private', 'events');

const args = process.argv.slice(2);
const graphArg = args.indexOf('--graph');
const GRAPH = graphArg >= 0 ? args[graphArg + 1] : 'debrief';

// ─── helpers ────────────────────────────────────────────────────────────────

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

// ─── connect ─────────────────────────────────────────────────────────────────

const db = await FalkorDB.connect({ socket: { host: 'localhost', port: 6379 } });
const graph = db.selectGraph(GRAPH);

async function run(cypher, params = {}) {
  return graph.query(cypher, params);
}

// ─── read saved event files ──────────────────────────────────────────────────

if (!fs.existsSync(EVENTS_DIR)) {
  console.log(yellow(`No events directory found at ${EVENTS_DIR}`));
  console.log('Import an event via the app first — it will be saved automatically.');
  process.exit(0);
}

const files = fs.readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.json'));

if (files.length === 0) {
  console.log(yellow('No saved event files found in _private/events/'));
  console.log('Import an event via the app first — it will be saved automatically.');
  process.exit(0);
}

console.log(cyan(`\nRe-seeding ${files.length} event(s) into graph: ${GRAPH}\n`));

let totalSessions = 0;
let totalSpeakers = 0;

for (const file of files) {
  const filePath = path.join(EVENTS_DIR, file);
  const { url, savedAt, extraction } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const { event, sessions } = extraction;

  console.log(cyan(`── ${event.name}`));
  console.log(`   URL:      ${url}`);
  console.log(`   Date:     ${event.date}`);
  console.log(`   Saved:    ${savedAt}`);
  console.log(`   Sessions: ${sessions.length}`);

  // Write Event node
  await run(
    `MERGE (e:Event {name: $name})
     SET e.date = $date, e.venue = $venue, e.url = $url`,
    { name: event.name, date: event.date, venue: event.venue, url },
  );

  for (const session of sessions) {
    totalSessions++;

    // Write Session node
    await run(
      `MERGE (e:Event {name: $eventName})
       MERGE (s:Session {title: $title, starts: $starts})
       SET s.ends = $ends, s.room = $room, s.abstract = $abstract
       MERGE (e)-[:HAS_SESSION]->(s)`,
      {
        eventName: event.name,
        title: session.title,
        starts: session.starts,
        ends: session.ends,
        room: session.room,
        abstract: session.abstract,
      },
    );

    for (const speaker of session.speakers) {
      if (!speaker.linkedin_url) continue;
      totalSpeakers++;

      // Write Person node
      await run(
        `MERGE (p:Person {linkedin_url: $url})
         SET p.name = $name,
             p.headline = $headline,
             p.current_company = $company`,
        {
          url: speaker.linkedin_url,
          name: speaker.name,
          headline: speaker.title ? `${speaker.title} at ${speaker.company}` : speaker.company,
          company: speaker.company,
        },
      );

      // Write Company node and WORKS_AT edge
      if (speaker.company) {
        await run(
          `MERGE (p:Person {linkedin_url: $url})
           MERGE (c:Company {name: $company})
           MERGE (p)-[:WORKS_AT]->(c)`,
          { url: speaker.linkedin_url, company: speaker.company },
        );
      }

      // Link speaker to session
      await run(
        `MATCH (p:Person {linkedin_url: $url})
         MATCH (s:Session {title: $title, starts: $starts})
         MERGE (p)-[:SPEAKS_AT]->(s)`,
        {
          url: speaker.linkedin_url,
          title: session.title,
          starts: session.starts,
        },
      );
    }
  }

  console.log(green(`   ✓ Written to graph`));
}

// ─── summary ─────────────────────────────────────────────────────────────────

const stats = await run(`
  MATCH (e:Event) WITH count(e) AS events
  MATCH (s:Session) WITH events, count(s) AS sessions
  MATCH (p:Person) WITH events, sessions, count(p) AS people
  RETURN events, sessions, people
`);

const row = stats.data?.[0] ?? {};
console.log(cyan(`\n─── Graph summary (${GRAPH}) ───────────────────────────────`));
console.log(`  Events:   ${row.events ?? 0}`);
console.log(`  Sessions: ${row.sessions ?? 0}`);
console.log(`  People:   ${row.people ?? 0}`);
console.log(green(`\nDone — ${files.length} event file(s), ${totalSessions} sessions, ${totalSpeakers} speaker links written.\n`));
console.log(`Tip: open the app and click "Refresh Schedule" to re-generate the Meet Plan.\n`);

await db.close();
