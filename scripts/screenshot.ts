import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:3001';
const OUT_DIR = path.join(process.cwd(), 'screenshots');
fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto(BASE_URL + '/today');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: path.join(OUT_DIR, 'today.png'), fullPage: false });

await page.goto(BASE_URL + '/recap');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: path.join(OUT_DIR, 'recap.png'), fullPage: false });

await page.goto(BASE_URL + '/wallet');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: path.join(OUT_DIR, 'wallet.png'), fullPage: false });

await browser.close();
console.log('Screenshots saved to', OUT_DIR);
