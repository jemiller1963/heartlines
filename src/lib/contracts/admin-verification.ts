// @polsia:user-owned — shared zod contract for the admin ID-verification review
// slice. Imported by BOTH the admin route handlers and the client island; a
// shape drift surfaces as a ZodError at the parse boundary so the list and the
// post-mutation response stay in lockstep with the optimistic UI.
//
// Keep client-importable: zod only — no server-only imports. The 4-value enum
// set mirrors the one already published from src/lib/contracts/profile.ts so
// the producer (`/api/profile/verification-id`) and this consumer agree.

import { z } from 'zod';

export const VerificationStatus = z.enum(['unverified', 'pending', 'approved', 'rejected']);
export type VerificationStatus = z.infer<typeof VerificationStatus>;

export const AdminVerificationItem = z.object({
  userId: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  age: z.number().int(),
  location: z.string(),
  submittedAt: z.string().datetime(),
  imagePath: z.string(),
  status: VerificationStatus,
});
export type AdminVerificationItem = z.infer<typeof AdminVerificationItem>;

export const AdminVerificationList = z.object({
  items: z.array(AdminVerificationItem),
});
export type AdminVerificationList = z.infer<typeof AdminVerificationList>;

export const AdminVerificationDecision = z.object({
  action: z.enum(['approve', 'reject']),
});
export type AdminVerificationDecision = z.infer<typeof AdminVerificationDecision>;
