// @polsia:user-owned — vitest for `GET /api/subscription`. The route reads
// `getSubscriptionForUser` (mocked here) and shapes the same payload the
// client islands parse. We confirm the auth gate + the
// contract-shaped response.

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const requireAuth = vi.fn();
  const view = {
    active: true,
    currentPeriodEnd: '2026-12-12T00:00:00.000Z',
    plan: 'premium-monthly',
  };
  return { requireAuth, view };
});

vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));
vi.mock('@/lib/business/subscription', () => ({
  getSubscriptionForUser: async () => mocks.view,
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.view.active = true;
  mocks.view.currentPeriodEnd = '2026-12-12T00:00:00.000Z';
  mocks.view.plan = 'premium-monthly';
  mocks.requireAuth.mockResolvedValue({ id: 'viewer-user', email: 'v@x' });
});

const route = () => import('@/app/api/subscription/route');

describe('GET /api/subscription', () => {
  it('401 when requireAuth rejects', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw Response.json({ error: 'Unauthorized' }, { status: 401 });
    });
    const { GET } = await route();
    const res = await GET(new Request('http://test/api/subscription'));
    expect(res.status).toBe(401);
  });

  it('200 with the live view shaped by the SubscriptionStatus contract', async () => {
    const { GET } = await route();
    const res = await GET(new Request('http://test/api/subscription'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.active).toBe(true);
    expect(typeof json.currentPeriodEnd).toBe('string');
    expect(json.plan).toBe('premium-monthly');
  });

  it('200 with empty fields when subscription is inactive (still parses as the contract)', async () => {
    mocks.view.active = false;
    mocks.view.currentPeriodEnd = null;
    mocks.view.plan = null;
    const { GET } = await route();
    const res = await GET(new Request('http://test/api/subscription'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.active).toBe(false);
    expect(json.currentPeriodEnd).toBeNull();
    expect(json.plan).toBeNull();
  });
});
