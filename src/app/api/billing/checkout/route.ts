// @polsia:user-owned — `POST /api/billing/checkout`: creates a hosted Stripe
// Checkout session for the single Heart Lines Premium tier ($25/mo) and
// returns the redirect URL. The price is server-side; the body carries
// NOTHING but a fixed product id, so the browser can't influence the amount.
//
// Gated with `requireAuth`; the module helper surfaces typed errors for
// onboarding / not-enabled / not-configured states so the client can render
// a useful toast. We never fall back to the raw SDK or a hardcoded URL.

import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { env } from '@/lib/env';
import { authOrResponse } from '@/lib/require-auth-result';
import {
  createCheckoutSession,
  StripeBillingConfigurationError,
  StripeBillingNotEnabledError,
  StripeBillingOnboardingError,
} from '@/lib/stripe-billing/client';
import type { CreateCheckoutSessionInput } from '@/lib/stripe-billing/schema';

export const dynamic = 'force-dynamic';

// One plan for now: $25 / month. Future work may add a year interval to the
// same shape; keep the map keyed by productId so the wire contract stays
// `productId → fixed price`. NEVER accept an amount from the request body.
const PRODUCTS: Record<string, { name: string; amountUsd: number; interval: 'month' | 'year' }> = {
  'premium-monthly': {
    name: 'Heart Lines Premium',
    amountUsd: 25,
    interval: 'month',
  },
};

const checkoutRequestSchema = z.object({
  productId: z.string().min(1),
});

/** PUBLIC origin for the Stripe redirects. Avoid `new URL(req.url).origin` —
 *  behind Polsia's proxy that's the INTERNAL bind host (e.g. localhost:3000)
 *  and the redirect breaks. Prefer: Origin header → forwarded host → env. */
function resolveOrigin(req: Request): string {
  const origin = req.headers.get('origin');
  if (origin) return origin.replace(/\/+$/, '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }
  return env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
}

export async function POST(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = checkoutRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        errors: { productId: 'Missing or invalid product id' },
      },
      { status: 400 },
    );
  }

  const product = PRODUCTS[parsed.data.productId];
  if (!product) {
    return NextResponse.json({ error: 'unknown_product' }, { status: 404 });
  }

  const origin = resolveOrigin(req);
  const successUrl = `${origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${origin}/pricing`;

  const customerEmail =
    typeof auth.session.email === 'string' && auth.session.email.length > 0
      ? auth.session.email
      : undefined;

  try {
    const input: CreateCheckoutSessionInput = {
      amountUsd: product.amountUsd,
      name: product.name,
      recurring: { interval: product.interval },
      successUrl,
      cancelUrl,
      ...(customerEmail !== undefined ? { customerEmail } : {}),
      // Echo the user id back as a reconciliation key — the events feed
      // can then pivot on `client_reference_id` for owner-attribution.
      clientReferenceId: auth.session.id,
    };
    const session = await createCheckoutSession(input);
    return NextResponse.json({ url: session.url }, { status: 201 });
  } catch (err) {
    if (err instanceof StripeBillingNotEnabledError) {
      return NextResponse.json({ errors: { billing: err.message } }, { status: 400 });
    }
    if (err instanceof StripeBillingOnboardingError) {
      return NextResponse.json({ errors: { billing: err.message } }, { status: 400 });
    }
    if (err instanceof StripeBillingConfigurationError) {
      return NextResponse.json({ errors: { billing: err.message } }, { status: 400 });
    }
    return NextResponse.json(
      { errors: { billing: 'Could not start checkout. Please try again.' } },
      { status: 502 },
    );
  }
}
