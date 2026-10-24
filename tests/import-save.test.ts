// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ writeCoupon: vi.fn(), writeAsset: vi.fn(), query: vi.fn(), upsert: vi.fn(async () => 'contact:test') }));
vi.mock('../lib/graph-writes', () => ({ writeCoupon: mocks.writeCoupon, writeAsset: mocks.writeAsset }));
vi.mock('../lib/graph', () => ({ query: mocks.query }));
vi.mock('../lib/brightdata', () => ({ fetchProfiles: vi.fn() }));
vi.mock('../lib/person-profile', () => ({ upsertContactProfile: mocks.upsert }));

beforeEach(() => vi.clearAllMocks());

describe('import save data boundary', () => {
  it('saves contact details through the profile-only path', async () => {
    const { POST } = await import('../app/api/import/save/route');
    const response = await POST(new NextRequest('http://localhost/api/import/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: '/uploads/contact.png', result: { kind: 'business_card', name: 'Contact', email: 'test@example.com', phone: '555', linkedin_url: '' } }),
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).personId).toBe('contact:test');
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Contact', email: 'test@example.com', phone: '555' }));
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('normalizes extracted objects before passing them to graph writes', async () => {
    const { POST } = await import('../app/api/import/save/route');
    const request = new NextRequest('http://localhost/api/import/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: '/uploads/example.png',
        result: { kind: 'coupon', code: 'PATCH50', value: { description: '$50 credits', url: 'https://example.com', code: 'PATCH50' } },
      }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(mocks.writeCoupon).toHaveBeenCalledWith(expect.objectContaining({ code: 'PATCH50', value: '$50 credits' }));
  });

  it('rejects unreadable data without writing to the graph', async () => {
    const { POST } = await import('../app/api/import/save/route');
    const request = new NextRequest('http://localhost/api/import/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: '/uploads/example.png', result: { kind: 'coupon', code: { unexpected: true } } }),
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await POST(request);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('code could not be read');
      expect(mocks.writeCoupon).not.toHaveBeenCalled();
      expect(mocks.writeAsset).not.toHaveBeenCalled();
      expect(mocks.query).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
