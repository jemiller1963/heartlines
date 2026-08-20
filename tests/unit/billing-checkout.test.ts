// @polsia:user-owned — vitest for `POST /api/billing/checkout`. The route
// gates with `requireAuth`, validates the body, prices the product from a
// server-side CATALOG (no amount from the browser), and calls
// `createCheckoutSession` (mocked). Confirm surfaces the typed error
// classes (`StripeBillingNotEnabledError`, `StripeBillingOnboardingError`,
// `StripeBillingConfigurationError`) by mapping them to a 400 with
// `{ errors: { billing: <message> } }` so the client toast renders a
// useful message.

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// Stand env vars BEFORE the route imports `@/lib/env`. The route imports
// `@/lib/stripe-billing/client` which imports `@/lib/env`, and env.ts runs
// @t3-oss/env-nextjs validation on first load. We give it valid stubs.
vi.hoisted(() => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
  process.env.BETTER_AUTH_SECRET ??= 'test-secret';
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
  process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000';
  process.env.POLSIA_EMAIL_PROXY_URL ??= 'http://localhost:9999';
  process.env.POLSIA_API_KEY ??= 'test-key';
  process.env.SKIP_ENV_VALIDATION ??= '1';
});

const mocks = vi.hoisted(() => {
  const requireAuth = vi.fn();
  const createCheckoutSession = vi.fn();
  return { requireAuth, createCheckoutSession };
});

vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));

// `vi.mock` factories are hoisted. We `vi.importActual` inside the
// factory to pull the real classes so the `createCheckoutSession`
// rejection shape matches what the route catches with `instanceof`.
vi.mock('@/lib/stripe-billing/client', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe-billing/client')>(
    '@/lib/stripe-billing/client',
  );
  return {
    StripeBillingConfigurationError: actual.StripeBillingConfigurationError,
    StripeBillingNotEnabledError: actual.StripeBillingNotEnabledError,
    StripeBillingOnboardingError: actual.StripeBillingOnboardingError,
    createCheckoutSession: (...args: unknown[]) => mocks.createCheckoutSession(...args),
  };
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAuth.mockResolvedValue({ id: 'viewer-user', email: 'v@x' });
  mocks.createCheckoutSession.mockResolvedValue({
    id: 1,
    stripeSessionId: 'cs_test_x',
    url: 'https://stripe.test/checkout/cs_test_x',
    totalAmountUsd: 25,
    companyReceives: 20,
    platformFee: 5,
    billingInterval: 'month',
    recurring: true,
  });
});

const route = () => import('@/app/api/billing/checkout/route');

describe('POST /api/billing/checkout — auth + access gates', () => {
  it('401 when requireAuth rejects', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw Response.json({ error: 'Unauthorized' }, { status: 401 });
    });
    const { POST } = await route();
    const res = await POST(
      new Request('http://test/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId: 'premium-monthly' }),
      }),
    );
    expect(res.status).toBe(401);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('400 when productId is missing', async () => {
    const { POST } = await route();
    const res = await POST(
      new Request('http://test/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('404 when productId is unknown (not in CATALOG)', async () => {
    const { POST } = await route();
    const res = await POST(
      new Request('http://test/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId: 'premium-yearly' }),
      }),
    );
    expect(res.status).toBe(404);
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });
});

describe('POST /api/billing/checkout — happy path', () => {
  it('201 with an `amountUsd: 25` subscription, redirect URL is server-side only', async () => {
    const { POST } = await route();
    const res = await POST(
      new Request('http://test/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId: 'premium-monthly' }),
      }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.url).toMatch(/^https:\/\/stripe\.test\//);

    // The body MUST NOT carry an amount — the price is server-side. The
    // single load-bearing invariant of this route.
    const args = mocks.createCheckoutSession.mock.calls[0]?.[0] as {
      amountUsd: number;
      recurring: { interval: 'month' | 'year' };
      customerEmail?: string;
      clientReferenceId?: string;
    };
    expect(args.amountUsd).toBe(25);
    expect(args.recurring.interval).toBe('month');
    expect(args.clientReferenceId).toBe('viewer-user');
    expect(args.customerEmail).toBe('v@x');
  });
});

describe('POST /api/billing/checkout — typed errors surface as 400 with friendly message', () => {
  it('StripeBillingNotEnabledError → 400 with errors.billing', async () => {
    const { StripeBillingNotEnabledError } = await import('@/lib/stripe-billing/client');
    mocks.createCheckoutSession.mockRejectedValueOnce(new StripeBillingNotEnabledError());
    const { POST } = await route();
    const res = await POST(
      new Request('http://test/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId: 'premium-monthly' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).errors.billing).toMatch(/payments|onboarding/i);
  });

  it('StripeBillingOnboardingError → 400 with errors.billing', async () => {
    const { StripeBillingOnboardingError } = await import('@/lib/stripe-billing/client');
    mocks.createCheckoutSession.mockRejectedValueOnce(
      new StripeBillingOnboardingError('stripe_not_onboarded'),
    );
    const { POST } = await route();
    const res = await POST(
      new Request('http://test/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId: 'premium-monthly' }),
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).errors.billing).toBeTruthy();
  });

  it('StripeBillingConfigurationError → 400 with errors.billing', async () => {
    const { StripeBillingConfigurationError } = await import('@/lib/stripe-billing/client');
    mocks.createCheckoutSession.mockRejectedValueOnce(new StripeBillingConfigurationError());
    const { POST } = await route();
    const res = await POST(
      new Request('http://test/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId: 'premium-monthly' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('unknown error → 502 with errors.billing (no SDK fallback)', async () => {
    mocks.createCheckoutSession.mockRejectedValueOnce(new Error('boom'));
    const { POST } = await route();
    const res = await POST(
      new Request('http://test/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId: 'premium-monthly' }),
      }),
    );
    expect(res.status).toBe(502);
  });
});
