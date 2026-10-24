import { test, expect } from '@playwright/test';
import path from 'node:path';

test('structured AI fields can be reviewed, edited, and saved without crashing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/import/classify', (route) => route.fulfill({ json: {
    kind: 'coupon', code: 'PATCH50', vendor: 'Bright Data',
    value: { description: '$50 credits', url: 'https://example.com/redeem', code: 'PATCH50' },
    description: 'Conference credits', expires: null, terms: '', redeem_url: 'https://example.com/redeem',
    _filePath: '/uploads/test-coupon.png',
  } }));
  await page.route('**/api/import/save', async (route) => {
    const body = route.request().postDataJSON();
    expect(body.result.value).toBe('$50 credits');
    expect(body.result.code).toBe('PATCH50');
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/import');
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve('fixtures/import/coupon.png'));
  await page.getByRole('button', { name: /^Import/ }).click();
  await expect(page.getByText('$50 credits', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('textbox').nth(2)).toHaveValue('$50 credits');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Save to Wallet' }).click();
  await expect(page.getByText('✓ Saved to Wallet!', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('one failed classification does not hide a successful file in the same batch', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/import/classify', (route) => {
    requests++;
    return route.fulfill(requests === 1
      ? { status: 502, json: { error: 'Image service unavailable' } }
      : { json: { kind: 'slide', title: 'Graph memory', speaker: { name: 'Demo Speaker' }, ideas: [{ description: 'Follow graph paths', url: 'https://example.com', code: 'demo' }], topics: [{ name: 'graphs' }], links: [{ url: 'https://example.com' }], _filePath: '/uploads/test-slide.png' } });
  });
  await page.goto('/import');
  await page.locator('input[type="file"]').first().setInputFiles([
    path.resolve('fixtures/import/coupon.png'), path.resolve('fixtures/import/slide.png'),
  ]);
  await page.getByRole('button', { name: /^Import/ }).click();
  await expect(page.getByText('Error: Image service unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('Follow graph paths', { exact: true })).toBeVisible();
  await expect(page.getByText('by Demo Speaker', { exact: true })).toBeVisible();
  await expect(page.getByText('graphs', { exact: true })).toBeVisible();
});
