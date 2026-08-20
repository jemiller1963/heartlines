// @polsia:user-owned — shared zod contract for the matching-feed swipe
// resource. Keep client-importable: zod only.
//
// better-auth User.id is a longer base36 string, not a strict cuid, so we
// validate the shape (non-empty, server-side length cap) rather than the
// format. The server is still the source of truth — a non-existent id
// simply misses in the DB lookup and returns the standard 400 envelope.

import { z } from 'zod';

export const SwipeDecision = z.enum(['ACCEPT', 'REJECT']);
export type SwipeDecision = z.infer<typeof SwipeDecision>;

export const UserId = z.string().min(1, 'Invalid user id').max(64, 'Invalid user id');

export const SwipeCreate = z.object({
  toUserId: UserId,
  decision: SwipeDecision,
});
export type SwipeCreate = z.infer<typeof SwipeCreate>;

export const SwipeResult = z.object({
  id: z.string(),
  fromUserId: UserId,
  toUserId: UserId,
  decision: SwipeDecision,
  createdAt: z.string().datetime(),
});
export type SwipeResult = z.infer<typeof SwipeResult>;
