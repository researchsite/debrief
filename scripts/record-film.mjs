/**
 * record-film.mjs
 * Playwright screen recording of debrief-film.html scrolling through all 11 scenes.
 * Designed to produce a shareable LinkedIn video attachment.
 *
 * Usage:
 *   node scripts/record-film.mjs
 *
 * Prereqs:
 *   - debrief-film.html served at BASE_URL (e.g. via `npx serve C:\AI\AGentic\Webprojects -p 4200`)
 *   - ffmpeg on PATH
 *
 * Output:
 *   _private/video/debrief-film-raw.webm
 *   _private/video/debrief-film.mp4   (1280×720, 30fps)
 */

import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL   = process.env.BASE_URL ?? 'http://127.0.0.1:4200';
const PAGE_PATH  = '/usecase/debrief-film.html';
const VID_DIR    = path.join(__dirname, '..', '_private', 'video');
fs.mkdirSync(VID_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function scrollToScene(page, sceneId, waitMs = 2800) {
  await page.evaluate(id => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, sceneId);
  await sleep(waitMs);
}

console.log('Launching browser...');
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: {
    dir: VID_DIR,
    size: { width: 1280, height: 720 },
  },
});
const page = await ctx.newPage();

console.log(`→ Opening ${BASE_URL}${PAGE_PATH}`);
await page.goto(BASE_URL + PAGE_PATH, { waitUntil: 'networkidle' });
await sleep(3000); // let cold-open animations settle

// ── Scene 1: Cold open — hold for counter animation (numbers count up ~2s) ──
console.log('→ Scene 1: Cold open');
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(6000);

// ── Scenes 2–11: scroll through each ─────────────────────────────
const scenes = [
  { id: 's2', label: 'Flashback / problem',   wait: 4500 },
  { id: 's3', label: 'The Cast',              wait: 4500 },
  { id: 's4', label: 'Pipeline',              wait: 5000 },
  { id: 's5', label: 'Graph deck',            wait: 22000 }, // 4 slides × ~5s auto-advance each
  { id: 's6', label: 'Build clock',           wait: 5000 },
  { id: 's7', label: 'Plot twists',           wait: 4500 },
  { id: 's8', label: 'The App (phone)',       wait: 16000 }, // ~8 screens × 2s each
  { id: 's9', label: 'Verdict / scores',      wait: 5000 },
  { id: 's10', label: 'Submissions gallery',  wait: 4000 },
  { id: 's11', label: 'Credits',              wait: 5000 },
];

for (const { id, label, wait } of scenes) {
  console.log(`→ ${label}`);
  await scrollToScene(page, id, wait);
}

// ── Slow scroll back to top for the loop feel ──────────────────────
console.log('→ Scrolling back to top...');
const totalH = await page.evaluate(() => document.body.scrollHeight);
const steps = 40;
for (let i = steps; i >= 0; i--) {
  await page.evaluate(y => window.scrollTo(0, y), Math.round((i / steps) * totalH));
  await sleep(50);
}
await sleep(2000);

console.log('\nClosing browser...');
await ctx.close();
await browser.close();

// ── Convert to MP4 ──────────────────────────────────────────────────
const files = fs.readdirSync(VID_DIR).filter(f => f.endsWith('.webm') && f.includes('debrief-film'));
const webm  = files.length
  ? path.join(VID_DIR, files[files.length - 1])
  : fs.readdirSync(VID_DIR).filter(f => f.endsWith('.webm')).sort().pop();

if (!webm) {
  // fallback: grab the newest .webm
  const allWebm = fs.readdirSync(VID_DIR)
    .filter(f => f.endsWith('.webm'))
    .map(f => ({ f, t: fs.statSync(path.join(VID_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  if (!allWebm.length) { console.error('No .webm found.'); process.exit(1); }
  var srcPath = path.join(VID_DIR, allWebm[0].f);
} else {
  var srcPath = path.join(VID_DIR, webm);
}

const mp4 = path.join(VID_DIR, 'debrief-film.mp4');
console.log(`\nSource: ${srcPath}`);
console.log('Converting to MP4...');

try {
  execSync(
    `ffmpeg -y -i "${srcPath}" -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -r 30 -vf "scale=1280:720" "${mp4}"`,
    { stdio: 'inherit' }
  );
  console.log(`\n✓ MP4 saved: ${mp4}`);
  console.log('  Ready to attach to LinkedIn post.');
} catch (e) {
  console.error('ffmpeg conversion failed:', e.message);
  console.log(`Raw webm: ${srcPath}`);
}
