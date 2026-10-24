import { test, expect } from '@playwright/test';
import path from 'node:path';

test('an unnamed conversation can be categorized, reviewed and saved without the null replace crash', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/transcripts', (route) => route.fulfill({ json: {
    ok: true, filename: 'Second.vtt', ignoredCount: 1, items: [{
      index: 0, starts: 0, ends: 60, text: 'We discussed graph storage.', candidates: [],
      extraction: { who: { name: null, company: null, role: null }, category: 'technical', summary: 'Discussed graph storage.', key_points: ['A graph suits relationship queries.'], topics: null, promises: null, confidence: null },
    }],
  } }));
  await page.route('**/api/transcripts/confirm', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.confirms[0]).toMatchObject({ personName: 'Unknown person 1', skip: false, extraction: { category: 'technical', who: { name: '' }, topics: [] } });
    await route.fulfill({ json: { ok: true, saved: 1 } });
  });
  await page.goto('/import/transcript');
  await page.locator('input[type="file"]').setInputFiles(path.resolve('fixtures/transcripts/sample.vtt'));
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByText('Technical discussion', { exact: true })).toBeVisible();
  await expect(page.getByText('A graph suits relationship queries.', { exact: true })).toBeVisible();
  await expect(page.getByText(/Ignored 1 segment/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save confirmed conversations' })).toBeDisabled();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await page.getByRole('button', { name: 'Save confirmed conversations' }).click();
  await expect(page.getByRole('heading', { name: 'Saved 1 conversation', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an all-noise transcript shows a clear empty state and cannot be saved', async ({ page }) => {
  await page.route('**/api/transcripts', (route) => route.fulfill({ json: { ok: true, items: [], filename: 'noise.vtt', ignoredCount: 2 } }));
  await page.goto('/import/transcript');
  await page.locator('input[type="file"]').setInputFiles(path.resolve('fixtures/transcripts/sample.vtt'));
  await page.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(page.getByText(/No substantive conversations found/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save confirmed conversations' })).toBeDisabled();
});
