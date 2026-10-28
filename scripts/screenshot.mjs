import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';
const OUT_DIR = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const PAGES = [
  { name: 'today',      path: '/today' },
  { name: 'recap',      path: '/recap' },
  { name: 'wallet',     path: '/wallet' },
  { name: 'setup',      path: '/setup' },
  { name: 'event',      path: '/event' },
  { name: 'projects',   path: '/projects' },
  { name: 'import',     path: '/import' },
  { name: 'add-talk',   path: '/add-talk' },
  { name: 'add-person', path: '/add-person' },
  { name: 'why',        path: '/why' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

for (const { name, path: p } of PAGES) {
  try {
    await page.goto(BASE_URL + p, { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    const out = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`✓ ${name} → ${out}`);
  } catch (e) {
    console.warn(`✗ ${name}: ${e.message}`);
  }
}

await browser.close();
console.log('\nScreenshots saved to', OUT_DIR);
