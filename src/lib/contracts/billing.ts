// @polsia:user-owned — shared zod contract for the checkout endpoint
// (`POST /api/billing/checkout`). Only the URL leaks back to the browser;
// the server is the sole source of the price and the redirect targets.
//
// Keep client-importable: zod only — no server-only imports.

import { z } from 'zod';

export const CheckoutResult = z.object({
  url: z.string().url(),
});
export type CheckoutResult = z.infer<typeof CheckoutResult>;
