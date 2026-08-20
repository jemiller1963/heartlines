// @polsia:user-owned — shared zod contract for the privacy resource.
// Single source of truth imported by BOTH the route handler and the client
// page; a shape drift surfaces as a tsc / ZodError at the parse boundary.
// Keep client-importable: zod only — no server-only imports.

import { z } from 'zod';

export const PrivacyPatch = z.object({
  profilePublic: z.boolean().optional(),
  hideLastActive: z.boolean().optional(),
  hideReadReceipts: z.boolean().optional(),
});
export type PrivacyPatch = z.infer<typeof PrivacyPatch>;

export const PrivacyItem = PrivacyPatch.extend({
  id: z.string(),
  userId: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PrivacyItem = z.infer<typeof PrivacyItem>;
