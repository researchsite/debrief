#!/usr/bin/env node
/**
 * Seeds clearly labelled sample data for the Calendar board: people met and
 * sessions attended earlier today, plus sessions planned for today, tomorrow
 * and the day after. Every node it creates carries `sample: true`; re-running
 * replaces the previous sample data and never touches real captures.
 *
 * Usage:
 *   node scripts/seed-calendar-sample.mjs            # (re)seed the debrief graph
 *   node scripts/seed-calendar-sample.mjs --clear    # remove sample data only
 *   node scripts/seed-calendar-sample.mjs --graph debrief_test
 */

import { FalkorDB } from 'falkordb';
import fs from 'fs';

for (const file of ['.env.local', '.env']) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

const args = process.argv.slice(2);
const graphArg = args.indexOf('--graph');
const GRAPH = graphArg >= 0 ? args[graphArg + 1] : (process.env.FALKORDB_GRAPH ?? 'debrief');
const CLEAR_ONLY = args.includes('--clear');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const db = await FalkorDB.connect(
  process.env.FALKORDB_URL
    ? { url: process.env.FALKORDB_URL }
    : {
        socket: {
          host: process.env.FALKORDB_HOST ?? 'localhost',
          port: Number(process.env.FALKORDB_PORT ?? 6379),
          tls: process.env.FALKORDB_SSL === 'true',
        },
        ...(process.env.FALKORDB_USERNAME && { username: process.env.FALKORDB_USERNAME }),
        ...(process.env.FALKORDB_PASSWORD && { password: process.env.FALKORDB_PASSWORD }),
      },
);
const graph = db.selectGraph(GRAPH);
const run = (cypher, params = {}) => graph.query(cypher, { params });

await run('MATCH (n) WHERE n.sample = true DETACH DELETE n');
if (CLEAR_ONLY) {
  console.log(`Removed sample calendar data from graph "${GRAPH}".`);
  await db.close();
  process.exit(0);
}

const me = await run('MATCH (me:Me) RETURN count(me) AS n');
if (Number(me.data?.[0]?.n ?? 0) === 0) {
  console.error(`Graph "${GRAPH}" has no Me node. Run the setup flow (/setup) first.`);
  await db.close();
  process.exit(1);
}

const now = Date.now();
const todayStart = new Date(now).setHours(0, 0, 0, 0);
const tomorrowStart = new Date(todayStart + 36 * HOUR).setHours(0, 0, 0, 0);
const dayAfterStart = new Date(tomorrowStart + 36 * HOUR).setHours(0, 0, 0, 0);
const at = (dayStart, hours, minutes = 0) => dayStart + hours * HOUR + minutes * MIN;

/** Spreads past captures across today without leaving today or entering the future. */
function earlierToday(fraction) {
  const elapsed = now - todayStart;
  return todayStart + Math.floor(elapsed * fraction);
}

const people = [
  { name: 'Priya Natarajan', company: 'Bright Data', headline: 'Solutions Engineer, public web data', when: earlierToday(0.55) },
  { name: 'Marcus Chen', company: 'FalkorDB', headline: 'Developer Advocate, graph databases', when: earlierToday(0.68) },
  { name: 'Sofia Alvarez', company: 'OpenAI', headline: 'Applied AI Engineer', when: earlierToday(0.8) },
  { name: 'Jordan Lee', company: 'Qodo', headline: 'Staff Engineer, code review agents', when: earlierToday(0.93) },
];

const attended = [
  {
    title: 'Graph Memory for AI Agents',
    room: 'Main Hall',
    when: earlierToday(0.6),
    ideas: ['Store every conversation as a graph edge', 'Explain recommendations with multi-hop paths'],
  },
  {
    title: 'Fresh Web Data at Conference Scale',
    room: 'Workshop Room B',
    when: earlierToday(0.85),
    ideas: ['Enrich speaker profiles right before a session'],
  },
];

const planned = [
  { title: 'Lightning Demos and Awards', room: 'Main Stage', when: Math.max(now + 45 * MIN, at(todayStart, 17, 30)) },
  { title: 'Keynote: Agents That Remember', room: 'Main Hall', when: at(tomorrowStart, 9, 30) },
  { title: 'Workshop: Multi-hop Queries with FalkorDB', room: 'Workshop Room B', when: at(tomorrowStart, 11, 0) },
  { title: 'Panel: Hiring in the AI Era', room: 'Stage 2', when: at(tomorrowStart, 13, 30) },
  { title: 'Coffee chat: scraping playbooks with Bright Data', room: 'Sponsor Lounge', when: at(tomorrowStart, 15, 0) },
  { title: 'Office Hours: Shipping Agents to Production', room: 'Booth 12', when: at(dayAfterStart, 10, 0) },
].filter((p) => p.when < dayAfterStart + DAY);

for (const p of people) {
  await run(
    `MATCH (me:Me)
     CREATE (person:Person {name: $name, headline: $headline, sample: true})
     MERGE (c:Company {name: $company})
     CREATE (person)-[:WORKS_AT]->(c)
     CREATE (me)-[:MET {at: $when}]->(person)`,
    { name: p.name, headline: p.headline, company: p.company, when: p.when },
  );
}

for (const s of attended) {
  await run(
    `MATCH (me:Me)
     CREATE (s:Session {title: $title, room: $room, at: $when, sample: true})
     CREATE (me)-[:SAW]->(s)
     WITH s
     UNWIND $ideas AS text
     CREATE (s)-[:SPARKED]->(:Idea {text: text, sample: true})`,
    { title: s.title, room: s.room, when: s.when, ideas: s.ideas },
  );
}

for (const p of planned) {
  await run(
    `MATCH (me:Me)
     CREATE (s:Session {title: $title, room: $room, at: $when, sample: true})
     CREATE (me)-[:PLANS]->(s)`,
    { title: p.title, room: p.room, when: p.when },
  );
}

const isoDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const coupons = [
  { code: 'FALKOR-CLOUD-3M', vendor: 'FalkorDB', value: '3 months free', description: 'FalkorDB Cloud Pro for your hackathon graph', expires: isoDate(now + 30 * DAY), terms: 'New workspaces only', redeemUrl: 'https://www.falkordb.com/', when: earlierToday(0.62) },
  { code: 'BRIGHT-DEVCONF25', vendor: 'Bright Data', value: '25% off', description: 'First month of Web Unlocker and SERP API', expires: isoDate(now + 21 * DAY), terms: 'One use per account', redeemUrl: 'https://brightdata.com/', when: earlierToday(0.7) },
  { code: 'QODO-TEAMS-30', vendor: 'Qodo', value: '30-day trial', description: 'Qodo Teams AI code review for your repo', expires: isoDate(now + 14 * DAY), terms: 'Up to 10 seats', redeemUrl: 'https://www.qodo.ai/', when: earlierToday(0.78) },
  { code: 'DEVCONF-HOODIE', vendor: 'DevConf Store', value: 'Free hoodie', description: 'Show this code at the merch booth', expires: isoDate(now + 1 * DAY), terms: 'While supplies last', redeemUrl: '', when: earlierToday(0.88) },
  { code: 'COFFEE-BOGO', vendor: 'Blue Bottle Coffee', value: 'Buy 1 get 1', description: 'Any espresso drink at the venue cart', expires: isoDate(now + 3 * DAY), terms: 'Venue cart only', redeemUrl: '', when: earlierToday(0.96) },
];
for (const c of coupons) {
  await run(
    `CREATE (coupon:Coupon {code: $code, vendor: $vendor, value: $value, description: $description,
       expires: $expires, terms: $terms, redeem_url: $redeemUrl, used: false, created_at: $when, sample: true})
     MERGE (company:Company {name: $vendor})
     CREATE (coupon)-[:FROM]->(company)`,
    c,
  );
}

console.log(
  `Seeded graph "${GRAPH}" with ${people.length} people met, ${attended.length} sessions attended, ` +
    `${planned.length} planned sessions and ${coupons.length} wallet codes (all marked sample). Remove with --clear.`,
);
await db.close();
