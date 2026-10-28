# Debrief — Conference Memory That Doesn't Expire

![Next.js](https://img.shields.io/badge/Next.js_16-black?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![FalkorDB](https://img.shields.io/badge/FalkorDB-818CF8?logoColor=white)
![Tests](https://img.shields.io/badge/tests-119_passing-4ade80)
![PRs](https://img.shields.io/badge/PRs_merged-26-818cf8)
![Hackathon](https://img.shields.io/badge/Patch_the_Conference_2024-San_Francisco-f472b6)

> Built and used at the same hackathon, on the same day.  
> A graph-powered web app that remembers every person, session, and idea from a conference — and turns them into a ranked meet plan, a full-day recap, and AI follow-ups.

---

<a href="https://rawweights.com/usecase/debrief-film.html">
  <img src="https://rawweights.com/images/debrief/recap.png" alt="Debrief recap — 14 people, 10 sessions, 10 ideas, 2307 graph nodes from one day" width="100%">
</a>

<p align="center">
  <strong>▶ <a href="https://rawweights.com/usecase/debrief-film.html">Watch the build story — Same Day (1:45)</a></strong>
  &nbsp;·&nbsp;
  <a href="https://rawweights.com/usecase/debrief.html">Technical deep dive</a>
  &nbsp;·&nbsp;
  Made with <a href="https://adalagent.com">AdaL</a>
</p>

---

## What it does

- **Import an event** — paste any event URL; the app fetches speakers, scores who to meet based on your goals, and produces a ranked Meet plan with suggested openers. URL → plan in ~30 seconds.
- **Add a person** — paste a LinkedIn URL, scan a QR, or upload a QR image. Common-ground badges appear instantly (shared company, school, topics). Background AI research writes a context card that never overwrites your note.
- **Import your connections** — upload LinkedIn's `Connections.csv`; every first-degree connection becomes a graph node, enabling warm-intro path queries.
- **Log a talk** — title + speaker + note or slide photo; ideas and topics extracted automatically.
- **Import anything** — QR codes, coupons, business cards, Zoom transcripts. Each lands in the right part of the graph.
- **Recap** — end-of-day view: counts, your intent card, ideas by topic, drafted follow-ups ranked by why you came.
- **Why?** — tap any recommendation to see the multi-hop graph path rendered live with react-force-graph-2d.
- **Wallet** — every scanned coupon in one searchable list with copy + expiry warnings.

---

## Stack

| Layer | Choice |
|---|---|
| App | Next.js 16 (App Router) · TypeScript |
| UI | Tailwind 4 · shadcn/ui · mobile-first (390 px) |
| Graph DB | FalkorDB (Docker or GCP) · `falkordb` npm client |
| Web data | Bright Data LinkedIn Scraper · Web Unlocker · SERP |
| AI | OpenAI `gpt-4o-mini` (text + vision) |
| Graph viz | react-force-graph-2d (client-only, SSR disabled) |
| Tests | Vitest (integration, real FalkorDB) · Playwright (E2E) |
| Code review | Qodo (reviewed all 26 PRs on the day) |

---

## Quick start

### Prerequisites
- Node.js 22+
- Docker Desktop

### 1. Start FalkorDB
```bash
docker run -d --name falkordb -p 6379:6379 -p 3000:3000 falkordb/falkordb
# FalkorDB Browser → http://localhost:3000
```

### 2. Install and configure
```bash
npm install
cp .env.example .env.local
# Fill in OPENAI_API_KEY — leave BRIGHTDATA_MOCK=true to skip Bright Data credits
```

### 3. Run
```bash
npm run dev
# App → http://localhost:3001
```

### 4. First-time setup
Go to **http://localhost:3001/setup** → enter your name and LinkedIn URL → set the event → pick your intents → optionally upload your LinkedIn archive CSVs.

### Mock mode — no API keys needed
Set `USE_MOCK_DATA=true` in `.env.local`. Every API route returns fixture data; all pages work without any credentials. The committed fixtures use **fictional personas only** — no real personal data is in this repository.

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
    │   Bright Data   │ │  OpenAI    │ │  FalkorDB        │
    │  Web Unlocker   │ │ gpt-4o-mini│ │  (Docker / GCP)  │
    │  SERP API       │ │ text+vision│ │                  │
    │  LinkedIn       │ │            │ │  Me · Person     │
    │  Datasets       │ │            │ │  Event · Session │
    └─────────────────┘ └────────────┘ │  Note · Idea     │
                                       │  Company · Intent│
                                       │  FollowUp · …    │
                                       └──────────────────┘
```

---

## Graph schema

```
(Me)-[:HAS_INTENT]->(Intent)
(Me)-[:ATTENDED]->(Event)-[:HAS_SESSION]->(Session)
(Session)-[:SPEAKS_AT]-(Person)
(Me)-[:MET]->(Person)
(Me)-[:CONNECTED]->(Person)            # LinkedIn connections CSV
(Person)-[:WORKS_AT]->(Company)
(Person)-[:HAS_NOTE]->(Note)           # your words, immutable
(Person)-[:HAS_CONTEXT]->(Context)     # AI research, separate from note
(Session)-[:SPARKED]->(Idea)
(Me)-[:PLANS_TO_MEET { score, opener }]->(Person)

# warm-intro path (3 hops)
(Me)-[:CONNECTED]->(bridge:Person)-[:WORKS_AT]->(co:Company)
     <-[:WORKS_AT]-(speaker:Person)
```

---

## Hackathon outcomes — Patch the Conference, Oct 24 2024

| Metric | Value |
|---|---|
| PRs merged | 26 |
| Tests passing | 119 |
| People tracked at event | 14 |
| Ideas captured | 10 |
| Sessions logged | 10 |
| Graph nodes (end of day) | 2,307 |
| Graph relationships | 2,677 |
| URL → ranked meet plan | ~30 seconds |
| API spend (full day) | < $2 (gpt-4o-mini) |

---

## Tests

```bash
npm test            # Vitest integration tests (requires FalkorDB running)
npm run test:e2e    # Playwright E2E (requires dev server on port 3001)
npm run build       # Production build check
```

Tests use the `debrief_test` graph — the production `debrief` graph is never touched.

---

## Project structure

```
app/
  add-person/      Add a person (LinkedIn URL · QR · note)
  add-talk/        Add a talk note (with optional slide photo)
  event/           Event import + Meet plan
  import/          Import anything (images · PDFs · transcripts)
  person/[url]/    Person detail (My note vs Researched context)
  recap/           Recap: counts · intent · ideas · follow-ups
  setup/           First-time setup + LinkedIn archive import
  today/           Today timeline
  wallet/          Coupon wallet
  why/             Graph path visualisation
  api/             All API routes
lib/
  graph.ts         FalkorDB client + query helpers
  graph-writes.ts  All graph read/write logic
  brightdata.ts    Profile · SERP · page-fetch (mock-mode aware)
  research.ts      Auto-research: SERP + OpenAI context bullets
  event-extract.ts Event import pipeline
  vtt-parser.ts    WebVTT parser + conversation splitter
fixtures/          Mock API responses + test CSVs (fictional data only)
scripts/           Utility scripts (photo URL updates · demo recording)
```

---

## Build story

| | |
|---|---|
| **Cinematic walkthrough** | [rawweights.com/usecase/debrief-film.html](https://rawweights.com/usecase/debrief-film.html) |
| **Technical deep dive** | [rawweights.com/usecase/debrief.html](https://rawweights.com/usecase/debrief.html) |
| **Hackathon** | [Patch the Conference 2024](https://www.wemakedevs.org/hackathons/ptc) · WeMakeDevs |
| **Sponsors** | [FalkorDB](https://falkordb.com) · [Bright Data](https://brightdata.com) · [Qodo](https://qodo.ai) |

---

*Built by Sham Hassanchi, Madhu Koseke, and Madhughnea Adabala · Powered by FalkorDB + Bright Data + OpenAI · All PRs reviewed by Qodo · Built overnight with Claude Code*
