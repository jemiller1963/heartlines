// @polsia:user-owned — shared zod contract for the user's subscription
// status (`GET /api/subscription`). Imported by BOTH the route handler and
// client islands (dashboard badge, conversation and video-sessions pages) so
// the shape can't drift silently.
//
// Keep client-importable: zod only — no server-only imports, no secrets.

import { z } from 'zod';

export const SubscriptionStatus = z.object({
  active: z.boolean(),
  // ISO-8601 timestamp — the period the current subscription will renew at.
  // Present only when `active === true` (a canceled subscription keeps the
  // field briefly, but the cached view treats "no active" as "no current_end").
  currentPeriodEnd: z.string().datetime().nullable(),
  // Display label for the plan (e.g. "Premium") — present when active.
  plan: z.string().nullable(),
});
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;
