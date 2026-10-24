import { test, expect } from '@playwright/test';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const payloads: string[] = JSON.parse(readFileSync(path.resolve('fixtures/qr/payloads.json'), 'utf8'));
const items = payloads.map((payload, index) => ({ id: `qr-${index}`, source: 'qr', qr: { id: `qr-${index}`, payload }, result: { kind: 'qr', text: payload } }));

test('real API decodes every QR without AI when scanning an uploaded image', async ({ request }) => {
  const response = await request.post('/api/import/classify', { multipart: {
    file: { name: 'multiple.png', mimeType: 'image/png', buffer: readFileSync(path.resolve('fixtures/qr/multiple.png')) }, scanOnly: 'true',
  } });
  expect(response.status()).toBe(200);
  const data = await response.json();
  expect(data.items.map((item: { qr: { payload: string } }) => item.qr.payload).sort()).toEqual([...payloads].sort());
});

test('multiple QR items support independent resolution, editing, saving, retry and dismissal', async ({ page }) => {
  let offerAttempts = 0;
  const saved: Record<string, unknown>[] = [];
  await page.route('**/api/import/classify', (route) => route.fulfill({ json: { kind: 'qr', text: '', items, _filePath: '/uploads/qr-fixture.png' } }));
  await page.route('**/api/import/resolve-qr', async (route) => {
    const { payload } = route.request().postDataJSON();
    const item = items.find((item) => item.qr.payload === payload)!;
    if (payload === payloads[1] && ++offerAttempts === 1) {
      await route.fulfill({ json: { ok: true, item: { ...item, error: 'Could not read linked details. Retry, or save the decoded QR contents.' } } }); return;
    }
    const result = payload === payloads[1]
      ? { kind: 'coupon', code: 'QR50', vendor: 'Conference Tools', value: '$50', description: 'Conference credit', expires: null, terms: '', redeem_url: payload }
      : { kind: 'business_card', name: payload === payloads[0] ? 'Existing Contact' : 'QR Test Contact', company: 'Tools', title: 'Engineer', email: '', linkedin_url: payload === payloads[0] ? payload : '' };
    await route.fulfill({ json: { ok: true, item: { ...item, result } } });
  });
  await page.route('**/api/import/save', async (route) => { saved.push(route.request().postDataJSON()); await route.fulfill({ json: { ok: true, personId: 'contact:test' } }); });
  await page.goto('/import');
  await page.locator('input[type=file]').first().setInputFiles(path.resolve('fixtures/qr/multiple.png'));
  await page.getByRole('button', { name: /^Import/ }).click();
  await expect(page.locator('[data-import-item]')).toHaveCount(3);
  const contact = page.locator('[data-import-item]').filter({ hasText: payloads[0] });
  const offer = page.locator('[data-import-item]').filter({ hasText: payloads[1] });
  const card = page.locator('[data-import-item]').filter({ hasText: payloads[2] });
  const offerId = await offer.getAttribute('data-import-item');
  const contactId = await contact.getAttribute('data-import-item');
  await expect(contact.getByText('Existing Contact', { exact: true })).toBeVisible();
  await offer.getByRole('button', { name: 'Retry linked details' }).click();
  await offer.getByRole('button', { name: 'Edit', exact: true }).click();
  await offer.getByRole('textbox').first().fill('QR51');
  await offer.getByRole('button', { name: 'Done', exact: true }).click();
  await offer.getByRole('button', { name: 'Save to Wallet' }).click();
  await expect(page.locator(`[data-import-item="${offerId}"]`).getByText('✓ Saved to Wallet!', { exact: true })).toBeVisible();
  expect(saved[0]).toMatchObject({ result: { code: 'QR51' }, filePath: '/uploads/qr-fixture.png', qr: { payload: payloads[1] } });
  await card.getByRole('button', { name: 'Dismiss QR' }).click();
  await expect(page.locator('[data-import-item]')).toHaveCount(2);
  await contact.getByRole('button', { name: 'Add Person', exact: true }).click();
  await expect(page.locator(`[data-import-item="${contactId}"]`).getByRole('link', { name: 'View contact →' })).toBeVisible();
});

test('at most three QR destinations resolve at once', async ({ page }) => {
  let active = 0; let maximum = 0; let completed = 0;
  const six = Array.from({ length: 6 }, (_, index) => ({ ...items[0], id: `qr-${index}`, qr: { id: `qr-${index}`, payload: `https://example.com/${index}` } }));
  await page.route('**/api/import/classify', (route) => route.fulfill({ json: { kind: 'qr', text: '', items: six, _filePath: '/uploads/qr-fixture.png' } }));
  await page.route('**/api/import/resolve-qr', async (route) => {
    active++; maximum = Math.max(maximum, active);
    const { payload } = route.request().postDataJSON();
    await new Promise((resolve) => setTimeout(resolve, 100));
    active--; completed++;
    await route.fulfill({ json: { ok: true, item: { ...items[0], qr: { id: payload, payload }, result: { kind: 'qr', text: payload } } } });
  });
  await page.goto('/import');
  await page.locator('input[type=file]').first().setInputFiles(path.resolve('fixtures/qr/multiple.png'));
  await page.getByRole('button', { name: /^Import/ }).click();
  await expect.poll(() => completed).toBe(6);
  expect(maximum).toBe(3);
  await expect(page.getByRole('button', { name: 'Save QR details', exact: true })).toHaveCount(6);
});

test('Add Person lets the user choose between profiles from a QR image', async ({ page }) => {
  const urls = [payloads[0], 'https://www.linkedin.com/in/another-contact'];
  await page.route('**/api/import/classify', (route) => route.fulfill({ json: { items: urls.map((payload) => ({ qr: { payload } })) } }));
  await page.goto('/add-person');
  await page.locator('#note').fill('Keep this conversation note');
  await page.getByLabel('Upload QR image', { exact: true }).setInputFiles(path.resolve('fixtures/qr/multiple.png'));
  await page.getByRole('button', { name: urls[1], exact: true }).click();
  await expect(page.locator('#linkedin-url')).toHaveValue(urls[1]);
  await expect(page.locator('#note')).toHaveValue('Keep this conversation note');
});

test('camera denial offers the image upload alternative', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => { throw new DOMException('Denied', 'NotAllowedError'); } }); });
  await page.goto('/add-person');
  await page.getByRole('button', { name: 'Scan QR code' }).click();
  await expect(page.getByText('Camera access is unavailable. You can upload a QR image instead.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload QR image', exact: true })).toBeVisible();
});

test('camera starts after video mounts, decodes a profile and releases its stream', async ({ page }) => {
  const image = readFileSync(path.resolve('fixtures/qr/single.png')).toString('base64');
  await page.addInitScript(({ image }) => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: async () => {
      const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 500;
      const picture = new Image(); picture.src = `data:image/png;base64,${image}`; await picture.decode();
      canvas.getContext('2d')!.drawImage(picture, 0, 0);
      const stream = canvas.captureStream(10);
      (window as unknown as { testCameraStream: MediaStream }).testCameraStream = stream;
      return stream;
    } });
  }, { image });
  await page.goto('/add-person');
  await page.getByRole('button', { name: 'Scan QR code' }).click();
  await expect(page.locator('#linkedin-url')).toHaveValue(payloads[0]);
  expect(await page.evaluate(() => (window as unknown as { testCameraStream: MediaStream }).testCameraStream.getTracks().every((track) => track.readyState === 'ended'))).toBe(true);
});
