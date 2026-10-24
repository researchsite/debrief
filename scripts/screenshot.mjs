import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:3001';
const OUT_DIR = path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto(BASE_URL + '/today');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: path.join(OUT_DIR, 'today.png') });

await page.goto(BASE_URL + '/recap');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: path.join(OUT_DIR, 'recap.png') });

await page.goto(BASE_URL + '/wallet');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: path.join(OUT_DIR, 'wallet.png') });

await browser.close();
console.log('Screenshots saved to', OUT_DIR);
