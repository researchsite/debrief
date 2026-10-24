// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getCoupons: vi.fn() }));
vi.mock('../lib/graph-writes', () => ({ getCoupons: mocks.getCoupons }));

beforeEach(() => {
  mocks.getCoupons.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function get() {
  const { GET } = await import('../app/api/wallet/route');
  return GET();
}

describe('Wallet API', () => {
  it('returns the coupons on success', async () => {
    const coupons = [{ code: 'C1', vendor: 'V', used: false }];
    mocks.getCoupons.mockResolvedValue(coupons);
    const response = await get();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ coupons });
  });

  it('reports a graph failure as unavailable instead of an empty wallet', async () => {
    mocks.getCoupons.mockRejectedValue(new Error('graph down'));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Wallet unavailable' });
  });
});
