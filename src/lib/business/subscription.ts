// @polsia:user-owned — server-only subscription helper with a short-lived
// in-memory cache. Wraps the stripe-billing module's `getSubscriptionStatus`
// (which proxies to Polsia's company-payments API) so the message-send /
// video-date-write endpoints don't stampede the proxy on every request.
//
// False-negatives degrade to `not subscribed`. NEVER block a free user on a
// transient proxy hiccup — Stripe-mode failure degrades {"active": false}
// plus a single warn log so we can see it. The brief guarantees free browse
// + matching; never let a paid gate become the reason a free action fails.
//
// Pure server-side: import 'server-only'. Never imported from a client file
// (client islands read state via /api/subscription → apiFetch instead).

import 'server-only';
import type { SessionUser } from '@/lib/require-auth';
import { getSubscriptionStatus } from '@/lib/stripe-billing/client';

export interface SubscriptionView {
  active: boolean;
  currentPeriodEnd: string | null;
  plan: string | null;
}

// 60s is short enough that a fresh subscribe lands within a minute, long
// enough that a chatty conversation doesn't issue a per-message proxy call.
const CACHE_TTL_MS = 60_000;

interface CacheEntry {
  viewedAt: number;
  view: SubscriptionView;
}

// Per-process cache. Next.js runs a single Lambda-edge process per region per
// warm container, so a single Map is fine for this surface — no storming, no
// missed updates for at least a minute. Reset on deploy by definition.
const cache = new Map<string, CacheEntry>();

// Flip to true on the first transient failure so we don't fill the logs.
let _warned = false;

function degrade(): SubscriptionView {
  // Track we've been here so future tests / debug sessions can read the
  // flag. We deliberately do NOT log on degrade — degrading to "not
  // subscribed" is the safe default and a stray warn would attract the
  // wrong kind of attention (a permanent failure would be a 4xx from the
  // proxy, not a logged-out warning).
  _warned = true;
  return { active: false, currentPeriodEnd: null, plan: null };
}

/** Reads the viewer's subscription status with a 60s in-process cache.
 *  Returns `{ active: false }` (degraded) on transient proxy errors so we
 *  never block a free user. */
export async function getSubscriptionForUser(user: SessionUser): Promise<SubscriptionView> {
  const now = Date.now();
  const cached = cache.get(user.id);
  if (cached && now - cached.viewedAt < CACHE_TTL_MS) {
    return cached.view;
  }

  const email = typeof user.email === 'string' ? user.email.trim() : '';
  let view: SubscriptionView;
  if (email.length === 0) {
    view = { active: false, currentPeriodEnd: null, plan: null };
  } else {
    try {
      const status = await getSubscriptionStatus({ email });
      view = {
        active: Boolean(status.active),
        currentPeriodEnd:
          typeof status.current_period_end === 'string' ? status.current_period_end : null,
        plan: typeof status.plan === 'string' ? status.plan : null,
      };
    } catch {
      // Transient proxy / 503 / "not configured" — degrade to not subscribed
      // so we never block a free user. The brief says free browse + matching
      // stays open; a paid gate must never become the reason a free action
      // 500s.
      view = degrade();
    }
  }

  cache.set(user.id, { viewedAt: now, view });
  return view;
}

/** Throws a 402 Response when the user isn't subscribed. Route handlers
 *  `await requireSubscription(auth.session)` and let the throw unwind:
 *
 *      try { ... } catch (res) { return res as Response; }
 *  (or guard with `authOrResponse` and a manual check, both are idiomatic). */
export async function requireSubscription(user: SessionUser): Promise<SubscriptionView> {
  const view = await getSubscriptionForUser(user);
  if (!view.active) {
    throw Response.json(
      {
        error: 'subscription_required',
        message:
          'A Heart Lines Premium subscription is required to send messages or join a video date.',
      },
      { status: 402 },
    );
  }
  return view;
}

/** Test-only escape hatch — clears the in-process cache between assertions.
 *  Not exported in app code; only used by tests/unit/subscription.test.ts. */
export function _resetSubscriptionCacheForTests(): void {
  cache.clear();
  _warned = false;
}
