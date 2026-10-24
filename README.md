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
