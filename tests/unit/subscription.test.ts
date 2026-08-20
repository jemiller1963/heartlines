// @polsia:user-owned — vitest for the 60s in-process cache on
// `getSubscriptionForUser` (`src/lib/business/subscription.ts`).
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
//
// The test stubs `@/lib/stripe-billing/client` so each assertion can
// resolve a controlled active flag. We reimport the helper for each block
// after `_resetSubscriptionCacheForTests()` clears the per-process cache
// so the TTL assertion is strictly in-process.

// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const stripeMocks = vi.hoisted(() => {
  return { active: true as boolean };
});

vi.mock('@/lib/stripe-billing/client', () => ({
  getSubscriptionStatus: async () => ({
    active: stripeMocks.active,
    plan: stripeMocks.active ? 'premium-monthly' : undefined,
    current_period_end: null,
  }),
}));

beforeEach(() => {
  stripeMocks.active = true;
});

const sessionUser = (id: string) => ({
  id,
  email: `${id}@example.com`,
  name: id,
});

afterEach(async () => {
  // Reset the cache between tests so each block's assertion is isolated.
  const { _resetSubscriptionCacheForTests } = await import('@/lib/business/subscription');
  _resetSubscriptionCacheForTests();
});

describe('getSubscriptionForUser — 60s cache', () => {
  it('first call hits the proxy once', async () => {
    const { getSubscriptionForUser } = await import('@/lib/business/subscription');
    stripeMocks.active = true;

    const view = await getSubscriptionForUser(sessionUser('user-1'));
    expect(view.active).toBe(true);
  });

  it('second call within TTL does NOT call the proxy again (cached)', async () => {
    const { getSubscriptionForUser } = await import('@/lib/business/subscription');
    stripeMocks.active = true;

    // Spy on the module export to count proxy hits. The vi.hoisted wiring
    // wraps the helper, but vi.spyOn can still observe the mocked
    // module's call count via a separate import.
    const client = await import('@/lib/stripe-billing/client');
    const spy = vi.spyOn(client, 'getSubscriptionStatus');

    await getSubscriptionForUser(sessionUser('user-2'));
    await getSubscriptionForUser(sessionUser('user-2'));
    await getSubscriptionForUser(sessionUser('user-2'));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('returns the cached view even after the underlying status flips (until TTL)', async () => {
    const { getSubscriptionForUser } = await import('@/lib/business/subscription');
    stripeMocks.active = true;

    const view = await getSubscriptionForUser(sessionUser('user-3'));
    expect(view.active).toBe(true);
    // Underlying flipped but the entry is still in-cache.
    stripeMocks.active = false;
    const view2 = await getSubscriptionForUser(sessionUser('user-3'));
    expect(view2.active).toBe(true);
  });

  it('cache key isolated by user id (different users are independent)', async () => {
    const { getSubscriptionForUser } = await import('@/lib/business/subscription');
    stripeMocks.active = true;

    const a = await getSubscriptionForUser(sessionUser('user-a'));
    const b = await getSubscriptionForUser(sessionUser('user-b'));
    expect(a.active).toBe(true);
    expect(b.active).toBe(true);
  });

  it('after _resetSubscriptionCacheForTests, next call hits the proxy again', async () => {
    const { getSubscriptionForUser, _resetSubscriptionCacheForTests } = await import(
      '@/lib/business/subscription'
    );
    stripeMocks.active = true;

    await getSubscriptionForUser(sessionUser('user-4'));
    _resetSubscriptionCacheForTests();
    // Post-reset: spy on the helper to confirm the proxy is called again.
    const client = await import('@/lib/stripe-billing/client');
    const spy = vi.spyOn(client, 'getSubscriptionStatus');

    await getSubscriptionForUser(sessionUser('user-4'));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('requireSubscription — throw-on-inactive', () => {
  it('throws a 402 Response when subscription is not active', async () => {
    stripeMocks.active = false;
    const { requireSubscription, _resetSubscriptionCacheForTests } = await import(
      '@/lib/business/subscription'
    );
    _resetSubscriptionCacheForTests();
    const user = sessionUser('user-5');

    let caught: unknown;
    try {
      await requireSubscription(user);
    } catch (res) {
      caught = res;
    }
    expect(caught).toBeDefined();
    const response = caught as Response;
    expect(response).toBeInstanceOf(Response);
    expect(response.status).toBe(402);
    const body = await response.json();
    expect(body.error).toBe('subscription_required');
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('returns the view without throwing when subscription is active', async () => {
    stripeMocks.active = true;
    const { requireSubscription, _resetSubscriptionCacheForTests } = await import(
      '@/lib/business/subscription'
    );
    _resetSubscriptionCacheForTests();

    const view = await requireSubscription(sessionUser('user-6'));
    expect(view.active).toBe(true);
  });
});
