// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ profile: vi.fn(), page: vi.fn(), classify: vi.fn(), publicUrl: vi.fn() }));
vi.mock('../lib/person-profile', () => ({ resolvePersonProfile: mocks.profile }));
vi.mock('../lib/brightdata', () => ({ fetchPage: mocks.page }));
vi.mock('../lib/classify', () => ({ classifyPdfText: mocks.classify }));
vi.mock('../lib/public-url', () => ({ publicHttpUrl: mocks.publicUrl }));
import { resolveQrPayload } from '../lib/qr-resolve';
beforeEach(() => { vi.clearAllMocks(); mocks.publicUrl.mockImplementation(async (url) => url); });
afterEach(() => vi.useRealTimers());
describe('QR destination previews', () => {
  it('turns a LinkedIn profile into a contact preview without writing it', async () => {
    mocks.profile.mockResolvedValue({ name: 'Contact', headline: 'Engineer', current_company: 'Tools', linkedin_url: 'https://www.linkedin.com/in/contact' });
    const result = await resolveQrPayload('https://www.linkedin.com/in/contact');
    expect(result.result).toMatchObject({ kind: 'business_card', name: 'Contact' });
  });
  it('classifies web-page details and retains the source payload', async () => {
    mocks.page.mockResolvedValue('<h1>Conference offer</h1><script>ignore me</script>');
    mocks.classify.mockResolvedValue({ kind: 'coupon', code: 'PATCH50' });
    const result = await resolveQrPayload('https://example.com/offer');
    expect(result.qr?.resolvedUrl).toBe('https://example.com/offer');
    expect(mocks.classify.mock.calls[0][0]).not.toContain('ignore me');
  });
  it('preserves inaccessible destinations for retry or raw saving', async () => {
    mocks.page.mockRejectedValue(new Error('Unavailable'));
    const result = await resolveQrPayload('https://example.com/unavailable');
    expect(result.error).toContain('Retry');
    expect(result.result).toEqual({ kind: 'qr', text: 'https://example.com/unavailable' });
  });
  it('bounds destination resolution to 20 seconds', async () => {
    vi.useFakeTimers();
    mocks.page.mockImplementation((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('Timed out')))));
    // AbortSignal.timeout uses the runtime timer; supply a controllable signal.
    const controller = new AbortController();
    const spy = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    try {
      const task = resolveQrPayload('https://example.com/slow');
      await vi.advanceTimersByTimeAsync(20_000); controller.abort();
      expect((await task).error).toContain('Retry');
      expect(spy).toHaveBeenCalledWith(20_000);
    } finally { spy.mockRestore(); }
  });
  it('parses contacts and raw text without fetching a destination', async () => {
    expect((await resolveQrPayload('MECARD:N:Contact,Test;EMAIL:test@example.com;;')).result).toMatchObject({ kind: 'business_card', name: 'Test Contact' });
    expect((await resolveQrPayload('plain conference note')).result).toEqual({ kind: 'qr', text: 'plain conference note' });
    expect(mocks.page).not.toHaveBeenCalled();
    expect(mocks.profile).not.toHaveBeenCalled();
  });
});
