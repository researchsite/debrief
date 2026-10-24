// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({ image: vi.fn(), pdf: vi.fn(), extract: vi.fn() }));
vi.mock('../lib/classify', () => ({ classifyImage: mocks.image, classifyPdfText: mocks.pdf, extractPdfText: mocks.extract }));
const created: string[] = [];
beforeEach(() => { vi.clearAllMocks(); mocks.image.mockReset().mockResolvedValue({ kind: 'qr', text: 'A QR image' }); });
afterEach(() => { for (const file of created.splice(0)) unlinkSync(file); });
async function classify(filename = 'multiple.png', scanOnly = false) {
  const { POST } = await import('../app/api/import/classify/route');
  const form = new FormData();
  form.append('file', new File([readFileSync(path.resolve('fixtures/qr', filename))], filename, { type: 'image/png' }));
  if (scanOnly) form.append('scanOnly', 'true');
  const response = await POST(new NextRequest('http://localhost/api/import/classify', { method: 'POST', body: form }));
  const body = await response.json();
  if (body._filePath) created.push(path.join(process.cwd(), 'public', body._filePath));
  return { response, body };
}
describe('QR-aware classification API', () => {
  it('returns every decoded code and suppresses a duplicate AI QR card', async () => {
    const { response, body } = await classify();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(3);
    expect(body.items.every((item: { source: string }) => item.source === 'qr')).toBe(true);
    expect(body.kind).toBe('qr');
  });
  it('retains useful visual content alongside QR codes and the legacy result fields', async () => {
    mocks.image.mockResolvedValue({ kind: 'slide', title: 'Conference notes', ideas: [], topics: [], links: [] });
    const { body } = await classify();
    expect(body.items).toHaveLength(4);
    expect(body.title).toBe('Conference notes');
    expect(body.items[0].source).toBe('image');
  });
  it('keeps decoded codes even if image classification fails', async () => {
    mocks.image.mockRejectedValue(new Error('AI unavailable'));
    const { response, body } = await classify();
    expect(response.status).toBe(200);
    expect(body.items).toHaveLength(3);
    expect(body.warning).toContain('QR codes were decoded');
  });
  it('skips AI entirely for the Add Person QR-image scanner', async () => {
    const { body } = await classify('multiple.png', true);
    expect(body.items).toHaveLength(3);
    expect(mocks.image).not.toHaveBeenCalled();
  });
  it('retains the original non-QR import path', async () => {
    mocks.image.mockResolvedValue({ kind: 'slide', title: 'Ordinary image', ideas: [], topics: [], links: [] });
    const { body } = await classify('no-code.png');
    expect(body.items).toHaveLength(1);
    expect(body.kind).toBe('slide');
  });
});
