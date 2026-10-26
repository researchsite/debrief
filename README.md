# Debrief

**Your conference memory.** A no-install web app that remembers the people, talks and ideas from every event, and turns them into a recap and follow-ups based on why you went.

Built for the [Patch the Conference Hackathon](https://www.wemakedevs.org/hackathons/ptc) · October 24, 2026, Bright Data SF.

---

## What it does

- **Add a person** — paste a LinkedIn URL, scan a QR code, or upload a QR image; imported profiles are used first, with Bright Data as a fallback; common-ground badges appear instantly (shared company, school, topics); auto-research writes a separate AI context card that never touches your note.
- **Import an event** — paste any event URL; the app fetches sessions and speakers, scores who to meet based on your goals, and writes a ranked Meet plan with suggested openers.
- **Import your connections** — upload LinkedIn's `Connections.csv`; every first-degree connection becomes a graph node; warm-intro paths appear in the Meet plan.
- **Import anything** — drop a slide photo, coupon screenshot, or business card; real QR decoding finds every unique code in an image, and each code gets its own review card. Linked profiles/pages and vCard/MECARD contacts are previewed before saving; coupons land in the Wallet. QR contacts do not count as meetings.
- **Import transcripts** — upload a Zoom `.vtt` file; conversations split on 90-second gaps; review screen before anything is saved.
- **Add a talk note** — title + speaker + note or slide photo; OpenAI extracts ideas and topics.
- **Today timeline** — all captures newest first; floating `+` button for Add Person / Add Talk.
- **Recap** — counts, intent card, ideas by topic, drafted follow-up messages labeled `[Your note]` vs `[Researched]`.
- **Why?** — tap any recommendation to see the graph path behind it rendered with react-force-graph-2d.
- **Wallet** — every coupon in one searchable list with a Copy button and expiry warnings.

---

## Stack

| Layer | Choice |
|-------|--------|
| App | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind 4 + shadcn/ui, mobile-first (390px) |
| Graph DB | FalkorDB in Docker + `falkordb` npm client |
| Web data | Bright Data LinkedIn Scraper API + Web Unlocker + SERP |
| AI | OpenAI `gpt-4o-mini` |
| Graph viz | react-force-graph-2d (client-only, SSR disabled) |
| Tests | Vitest (integration against FalkorDB) + Playwright |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Mobile Browser  (Next.js 16 App Router · TypeScript · Tailwind 4)  │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ HTTP / fetch
        ┌─────────────────▼──────────────────────────────┐
        │              API Routes                         │
        │  /event/plan · /today · /recap · /person       │
        │  /research · /followup · /import · /setup      │
        └──────┬──────────────┬───────────────┬──────────┘
               │              │               │
    ┌──────────▼──────┐ ┌─────▼──────┐ ┌─────▼────────────┐
    │   Bright Data   │ │  OpenAI    │ │  FalkorDB Cloud  │
    │  ─ Web Unlocker │ │ gpt-4o-mini│ │  (GCP us-central)│
    │  ─ SERP API     │ │ text+vision│ │                  │
    │  ─ LinkedIn     │ │ event·slide│ │  Me·Person·Event │
    │    Datasets     │ │ openers    │ │  Session·Note    │
    └─────────────────┘ └────────────┘ │  Idea·Company    │
                                       │  Intent·FollowUp │
                                       └──────────────────┘
```

<details>
<summary>SVG architecture diagram (click to expand)</summary>

```svg
<svg viewBox="0 0 880 480" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;font-family:system-ui,sans-serif;background:#07101f;border-radius:12px">
  <defs>
    <marker id="arr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#818cf8"/></marker>
    <marker id="garr" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#4ade80"/></marker>
  </defs>
  <!-- User -->
  <rect x="300" y="20" width="280" height="60" rx="8" fill="#0f1c3a" stroke="#818cf8" stroke-width="1.5"/>
  <text x="440" y="47" fill="#e0e7ff" font-size="13" font-weight="700" text-anchor="middle">Mobile Browser</text>
  <text x="440" y="67" fill="#818cf8" font-size="11" text-anchor="middle">Next.js 16 · TypeScript · Tailwind 4</text>
  <!-- API layer -->
  <rect x="60" y="140" width="760" height="46" rx="8" fill="#131f3d" stroke="#4ade80" stroke-width="1.5"/>
  <text x="440" y="160" fill="#4ade80" font-size="11" font-weight="700" text-anchor="middle">API Routes</text>
  <text x="440" y="176" fill="#86efac" font-size="10" text-anchor="middle">/event/plan · /today · /recap · /person · /research · /followup · /import · /setup</text>
  <!-- Arrow browser→API -->
  <line x1="440" y1="80" x2="440" y2="138" stroke="#818cf8" stroke-width="1.5" marker-end="url(#arr)"/>
  <!-- Services -->
  <rect x="60" y="250" width="200" height="80" rx="8" fill="#0f2219" stroke="#4ade80" stroke-width="1.5"/>
  <text x="160" y="276" fill="#4ade80" font-size="13" font-weight="700" text-anchor="middle">Bright Data</text>
  <text x="160" y="294" fill="#86efac" font-size="10" text-anchor="middle">Web Unlocker (JS pages)</text>
  <text x="160" y="308" fill="#86efac" font-size="10" text-anchor="middle">SERP · LinkedIn Datasets</text>
  <rect x="340" y="250" width="200" height="80" rx="8" fill="#1a1a0a" stroke="#fbbf24" stroke-width="1.5"/>
  <text x="440" y="276" fill="#fbbf24" font-size="13" font-weight="700" text-anchor="middle">OpenAI gpt-4o-mini</text>
  <text x="440" y="294" fill="#fde68a" font-size="10" text-anchor="middle">Event extraction · Slide vision</text>
  <text x="440" y="308" fill="#fde68a" font-size="10" text-anchor="middle">Opener generation · Follow-ups</text>
  <rect x="620" y="250" width="200" height="80" rx="8" fill="#0a1428" stroke="#818cf8" stroke-width="1.5"/>
  <text x="720" y="276" fill="#818cf8" font-size="13" font-weight="700" text-anchor="middle">FalkorDB Cloud</text>
  <text x="720" y="294" fill="#c7d2fe" font-size="10" text-anchor="middle">GCP us-central1</text>
  <text x="720" y="308" fill="#c7d2fe" font-size="10" text-anchor="middle">Multi-hop Cypher queries</text>
  <!-- API→services arrows -->
  <line x1="160" y1="186" x2="160" y2="248" stroke="#4ade80" stroke-width="1.5" marker-end="url(#garr)"/>
  <line x1="440" y1="186" x2="440" y2="248" stroke="#4ade80" stroke-width="1.5" marker-end="url(#garr)"/>
  <line x1="720" y1="186" x2="720" y2="248" stroke="#4ade80" stroke-width="1.5" marker-end="url(#garr)"/>
  <!-- Bright Data + OpenAI → FalkorDB (data flows in) -->
  <path d="M 260 290 Q 440 390 620 290" fill="none" stroke="#818cf8" stroke-width="1" stroke-dasharray="5 3" marker-end="url(#arr)"/>
  <text x="440" y="385" fill="#818cf8" font-size="10" text-anchor="middle" font-style="italic">enriched nodes + generated text → graph</text>
  <!-- Graph node labels -->
  <rect x="620" y="360" width="200" height="90" rx="8" fill="#071530" stroke="#818cf8" stroke-width="2"/>
  <text x="720" y="382" fill="#e0e7ff" font-size="11" font-weight="700" text-anchor="middle">Graph nodes</text>
  <text x="720" y="398" fill="#818cf8" font-size="10" text-anchor="middle">Me · Person · Event · Session</text>
  <text x="720" y="413" fill="#818cf8" font-size="10" text-anchor="middle">Company · Note · Idea · Intent</text>
  <text x="720" y="428" fill="#818cf8" font-size="10" text-anchor="middle">Context · FollowUp · Coupon</text>
  <line x1="720" y1="330" x2="720" y2="358" stroke="#818cf8" stroke-width="1.5" marker-end="url(#arr)"/>
</svg>
```

</details>

---

## Graph Schema

```
(Me)-[:HAS_INTENT]->(Intent)           # networking / hiring / learning
(Me)-[:ATTENDED]->(Event)
(Event)-[:HAS_SESSION]->(Session)
(Session)-[:SPEAKS_AT]-(Person)
(Me)-[:MET]->(Person)
(Me)-[:CONNECTED]->(Person)            # from LinkedIn connections CSV
(Me)-[:SAW]->(Session)
(Person)-[:WORKS_AT]->(Company)
(Person)-[:HAS_NOTE]->(Note)           # your words, immutable
(Person)-[:HAS_CONTEXT]->(Context)     # AI research, separate from note
(Session)-[:SPARKED]->(Idea)
(Me)-[:PLANS_TO_MEET { score, opener }]->(Person)
(Me)-[:CONNECTED]->(bridge:Person)-[:WORKS_AT]->(co:Company)
     <-[:WORKS_AT]-(speaker:Person)    # warm-intro path (3 hops)
```

---

## Project outcomes

| Metric | Value |
|---|---|
| PRs merged | 19 |
| Total PRs raised | 26 |
| Tests (Vitest) | 119 |
| People tracked at event | 14 |
| Ideas captured | 10 |
| Sessions logged | 10 |
| Graph nodes (end of day) | 2,307 |
| Graph relationships | 2,677 |
| API spend (full day) | < $2 (gpt-4o-mini) |
| Time to ranked meet plan | ~30 seconds |

---

## Mock mode — no API keys needed

Set `USE_MOCK_DATA=true` in `.env.local` and the app returns fixture data on every API route. All pages are fully functional without FalkorDB, OpenAI, or Bright Data credentials.

The committed fixture data uses **fictional personas only** — no real personal data is committed to this repository.

---

## Setup

### Prerequisites
- Node.js 22+
- Docker Desktop (for FalkorDB)

### 1. Start FalkorDB
```bash
docker start falkordb
# or first time:
docker run -d --name falkordb -p 6379:6379 -p 3000:3000 falkordb/falkordb
```

FalkorDB Browser: http://localhost:3000

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
Copy `.env.example` to `.env.local` and fill in:
```
OPENAI_API_KEY=sk-proj-...
BRIGHTDATA_API_KEY=...          # get at the event, or leave blank for mock mode
BRIGHTDATA_SERP_ZONE=serp_api1
BRIGHTDATA_UNLOCKER_ZONE=web_unlocker1
BRIGHTDATA_MOCK=true            # set false when real keys are available
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
FALKORDB_GRAPH=debrief
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

### 4. Run the dev server
```bash
npm run dev
```

Open **http://localhost:3001** (not 3000 — that's FalkorDB Browser).

### 5. First-time setup
Go to http://localhost:3001/setup and:
- Enter your name and LinkedIn URL
- Set the event: **Patch the Conference Hackathon**, 2026-10-24
- Pick your intents (star one primary)
- Upload your LinkedIn archive CSVs (`Profile.csv`, `Positions.csv`, `Education.csv`, `Skills.csv`)
- Upload `Connections.csv` when it arrives from LinkedIn

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | — |
| `BRIGHTDATA_API_KEY` | Bright Data API key | — |
| `BRIGHTDATA_SERP_ZONE` | Bright Data SERP zone name | `serp_api1` |
| `BRIGHTDATA_UNLOCKER_ZONE` | Bright Data Web Unlocker zone name | `web_unlocker1` |
| `BRIGHTDATA_MOCK` | Return fixture data instead of calling Bright Data | `true` |
| `FALKORDB_HOST` | FalkorDB host | `localhost` |
| `FALKORDB_PORT` | FalkorDB port | `6379` |
| `FALKORDB_URL` | Full connection URL; takes precedence over host/port. `falkors://` enables TLS. Store in `.env` or `.env.local`. | — |
| `FALKORDB_GRAPH` | Graph name for production data | `debrief` |
| `NEXT_PUBLIC_APP_URL` | Full URL for internal fetch calls | `http://localhost:3001` |

---

## Mock Mode

When `BRIGHTDATA_MOCK=true` (the default):
- Profile enrichment returns fixtures from `fixtures/brightdata/profile.json`
- SERP searches return `fixtures/brightdata/serp.json`
- Event page fetch returns `fixtures/brightdata/event_page.html`

The app works end-to-end without any API credits. To switch to real mode: set `BRIGHTDATA_MOCK=false` and add your `BRIGHTDATA_API_KEY`.

---

## Tests

```bash
npm test           # Vitest integration tests (requires FalkorDB running)
npm run test:e2e   # Playwright end-to-end (requires dev server on port 3001)
npm run build      # Production build check
```

Tests use the `debrief_test` graph and never touch the production `debrief` graph.

### Real LinkedIn archive run

With the app running on port 3001 and `FALKORDB_URL` saved in `.env`:

```bash
node scripts/test-linkedin-e2e.mjs "/path/to/linkedin-export.zip" "https://www.linkedin.com/in/your-profile"
```

This separate script imports your real data into `debrief` through Chromium. It
sets up your profile with General Networking as the goal, imports Profile,
Positions, Education, Skills, and Connections, compares the graph with the CSVs,
repeats the imports to check for duplicates, and checks the relationship graph,
person page, and Today page. Other archive files are not imported. Aggregate
results and screenshots are saved under the ignored `_private/linkedin-e2e/`
directory.

---

## QR import and meeting capture

- Each decoded QR can be edited, saved, dismissed, or retried independently. Up to three linked destinations are read at once, with a 20-second deadline per destination.
- QR decoding uses local ZXing WASM and Sharp, not AI or a CDN. The ordinary image extraction is retained alongside decoded codes when it contains useful information.
- Saving a contact from Import does not record a meeting. Use **Add Person** to record a real conversation; its submission ID makes retries safe and its manual fallback preserves your real URL, note, and hiring setting.
- Meeting notes stay in your graph. Optional background research uses public profile/company information, independently of the meeting save.
- Raw, unsupported, or inaccessible QR contents remain reviewable and saveable. Source images and individual payloads are linked in the graph without overwriting other QR results.

Generate decoder fixtures with `node scripts/generate-qr-fixtures.mjs`. Run browser coverage with `npx playwright test e2e/qr-import.spec.ts e2e/add-person-reliability.spec.ts e2e/import-review.spec.ts --workers=1`.

The optional live integration check creates and deletes its own isolated test graph:

```bash
RUN_LIVE_GRAPH_TESTS=true node --env-file=.env node_modules/vitest/vitest.mjs run tests/qr-graph-live.test.ts
```

The following separate verification **records a real meeting in debrief**. Repeating it with the same URL and note reuses its submission ID:

```bash
node scripts/verify-person-capture.mjs "https://www.linkedin.com/in/contact" "Your conversation note"
```

Results and screenshots are saved in the ignored `_private/person-capture-verification/` directory.

---

## Project Structure

```
app/
  add-person/      Add a person (LinkedIn URL + QR + note)
  add-talk/        Add a talk note (with optional slide photo)
  event/           Event import + Meet plan
  import/          Import anything (images, PDFs, transcripts)
  person/[url]/    Person detail (My note vs Researched context)
  recap/           Recap: counts, intent, ideas, follow-ups
  setup/           First-time setup + LinkedIn archive import
  today/           Today timeline
  wallet/          Coupon wallet
  why/             Graph path visualization
  api/             All API routes
lib/
  graph.ts         FalkorDB client + query helpers
  graph-writes.ts  All graph read/write logic
  openai.ts        JSON completion helper
  brightdata.ts    Profile, SERP, page-fetch (mock mode aware)
  classify.ts      Image/PDF classification with OpenAI vision
  research.ts      Auto-research: SERP + OpenAI context bullets
  event-extract.ts Event import pipeline
  vtt-parser.ts    WebVTT parser
  vtt-splitter.ts  Conversation splitter (90s gap threshold)
  transcript-extract.ts  OpenAI extraction per conversation
  linkedin-csv.ts  LinkedIn CSV parser (skips note lines before header)
fixtures/
  brightdata/      Mock API responses
  linkedin/        Test CSV files (fake data)
  transcripts/     Sample VTT
  import/          Test images (coupon, slide, business card)
scripts/
  seed-owner.mjs   One-time seed: reads _private/linkedin/ CSVs into debrief graph
```

---

## Graph Model

Key node labels: `Me`, `Person`, `Company`, `School`, `Skill`, `Topic`, `Session`, `Idea`, `Note`, `Context`, `Source`, `Event`, `Intent`, `Role`, `FollowUp`, `Coupon`, `Asset`, `Transcript`, `Conversation`

Key relationships: `MET`, `CONNECTED`, `WORKS_AT`, `WORKED_AT`, `STUDIED_AT`, `HAS_SKILL`, `INTERESTED_IN`, `SAW`, `SPARKED`, `ABOUT`, `SPEAKS_AT`, `PART_OF`, `HAS_NOTE`, `HAS_CONTEXT`, `CITES`, `PLANS_TO_MEET`, `FOLLOW_UP`, `ATTENDED`, `HAS_INTENT`, `WANTS`, `HIRING`

---

## Demo Script (3 minutes)

1. **Today screen** — "I used it all day at the hackathon."
2. **Tap a person** — "Here's my note. And here's what Debrief researched — with sources."
3. **Recap** — "It tells me who to follow up with, ranked by why I came."
4. **Tap Why?** — "This is the path in the FalkorDB graph."
5. **Point at the graph** — "Me, MET Alex, WORKS_AT Stripe, HIRING Backend Engineer, WANTS — me."

---

*Built overnight with Claude Code · All PRs reviewed by Qodo · Powered by FalkorDB + Bright Data + OpenAI*
