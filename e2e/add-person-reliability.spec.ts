import { test, expect } from '@playwright/test';

for (const body of ['', '<html>Server error</html>', '{invalid']) {
  test(`keeps the form when the server returns ${body || 'an empty body'}`, async ({ page }) => {
    await page.route('**/api/person', (route) => route.fulfill({ status: 500, body }));
    await page.goto('/add-person');
    await page.locator('#linkedin-url').fill('https://www.linkedin.com/in/shamhc');
    await page.locator('#note').fill('about the event and builder tools');
    await page.getByRole('switch').check();
    await page.getByRole('button', { name: 'Add Person', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add Person', exact: true })).toBeVisible();
    await expect(page.locator('#note')).toHaveValue('about the event and builder tools');
    await expect(page.getByRole('switch')).toBeChecked();
    await expect(page.locator('main')).not.toContainText('JSON');
    await expect(page.locator('main')).toContainText('Please retry');
  });
}

test('manual fallback retains the real URL, note, hiring setting and submission ID', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await page.route('**/api/person', async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: requests.length === 1
      ? { ok: true, enrichmentFailed: true }
      : { ok: true, person: { id: 'person-1', name: 'Test Contact', headline: '', city: '', linkedin_url: 'https://www.linkedin.com/in/shamhc' } } });
  });
  await page.goto('/add-person');
  await page.locator('#linkedin-url').fill('https://www.linkedin.com/in/shamhc');
  await page.locator('#note').fill('about the event and builder tools');
  await page.getByRole('switch').check();
  await page.getByRole('button', { name: 'Add Person', exact: true }).click();
  await page.locator('#manual-name').fill('Test Contact');
  await page.getByRole('button', { name: 'Save manually' }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ linkedinUrl: requests[0].linkedinUrl, note: requests[0].note, isHiring: true, manual: true, requestId: requests[0].requestId });
  expect(typeof requests[0].requestId).toBe('string');
});
