import { describe, it, expect, afterAll, vi } from 'vitest';
import { writeCoupon, getCoupons, markCouponUsed } from '../lib/graph-writes';
import { query } from '../lib/graph';

const G = 'debrief_test';

afterAll(async () => {
  await query('MATCH (n:Coupon {code: "TESTCODE-123"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Company {name: "TestVendor"}) DETACH DELETE n', {}, G);
  await query('MATCH (n:Asset) WHERE n.file_path STARTS WITH "test-" DETACH DELETE n', {}, G);
});

describe('writeCoupon / getCoupons', () => {
  it('saves a coupon and retrieves it', async () => {
    await writeCoupon({
      code: 'TESTCODE-123',
      vendor: 'TestVendor',
      value: '$50',
      description: 'Test coupon for integration',
      expires: '2027-01-01',
      terms: 'No restrictions',
      redeemUrl: 'https://testvendor.com/redeem',
      assetPath: 'test-coupon.png',
    }, G);

    const coupons = await getCoupons(G);
    const found = coupons.find((c) => c.code === 'TESTCODE-123');
    expect(found).toBeDefined();
    expect(found!.vendor).toBe('TestVendor');
    expect(found!.used).toBe(false);
  });

  it('marks a coupon as used', async () => {
    await markCouponUsed('TESTCODE-123', G);
    const coupons = await getCoupons(G);
    const found = coupons.find((c) => c.code === 'TESTCODE-123');
    expect(found!.used).toBe(true);
  });
});

// Test classifyImage is mocked (don't call real OpenAI)
// vi.mock must be at the top level — moved here from inside describe
vi.mock('../lib/openai', () => ({
  jsonCompletion: vi.fn().mockResolvedValue({
    kind: 'coupon',
    code: 'MOCK-CODE',
    vendor: 'MockVendor',
    value: '$100',
    description: 'Mock coupon',
    expires: null,
    terms: '',
    redeem_url: '',
  }),
  JsonCompletionError: class extends Error {},
}));

describe('classifyImage mock', () => {
  it('returns a coupon classification from mock', async () => {
    const { classifyImage } = await import('../lib/classify');
    const result = await classifyImage('base64data', 'image/png');
    expect(result.kind).toBe('coupon');
  });
});
