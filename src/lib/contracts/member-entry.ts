// @polsia:user-owned — client/server contract for the post-auth member entry.
// Keep reviewStatus out of this wire shape; it is an internal decision input.

import { z } from 'zod';

export const MemberEntryDestination = z.enum(['/onboarding', '/review-status', '/feed']);
export type MemberEntryDestination = z.infer<typeof MemberEntryDestination>;

export const MemberEntryResponse = z.object({
  destination: MemberEntryDestination,
});
export type MemberEntryResponse = z.infer<typeof MemberEntryResponse>;
