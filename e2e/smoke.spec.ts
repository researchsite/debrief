import { test, expect } from '@playwright/test';

test('home page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Debrief/);
});

test('recap page renders person links in the browser', async ({ page }) => {
  await page.route('**/api/recap', (route) => route.fulfill({
    json: {
      counts: { peopleMet: 1, sessionsSaw: 0, ideas: 0, connectedAndMet: 0 },
      event: { eventName: 'Test Event', primaryIntent: 'networking' },
      people: [{ name: 'Élodie Test', company: 'Example', linkedinUrl: 'https://www.linkedin.com/in/elodie-test', noteText: '' }],
      ideas: [],
      followUps: [],
    },
  }));
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/recap');
  await expect(page.getByRole('link', { name: 'Élodie Test' })).toHaveAttribute('href', /person\//);
  expect(errors).toEqual([]);
});
