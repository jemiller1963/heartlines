// @polsia:user-owned — shared zod contract for the matching-feed block
// resource. Keep client-importable: zod only.
//
// better-auth User.id is a longer base36 string, not a strict cuid, so we
// reuse the canonical `UserId` validator from the swipe contract (do NOT
// redefine it here — one source of truth for the id shape keeps the two
// resources consistent).

import { z } from 'zod';
import { UserId } from '@/lib/contracts/swipe';

export const BlockCreate = z.object({
  toUserId: UserId,
});
export type BlockCreate = z.infer<typeof BlockCreate>;

export const BlockResult = z.object({
  id: z.string(),
  blockerId: UserId,
  blockedId: UserId,
  createdAt: z.string().datetime(),
  // Present (true) only when the row already existed — i.e. the post was a
  // re-block attempt. Absent (omitted) on the first successful create.
  idempotent: z.boolean().optional(),
});
export type BlockResult = z.infer<typeof BlockResult>;

export const BlockDelete = z.object({
  blockedId: UserId,
});
export type BlockDelete = z.infer<typeof BlockDelete>;

export const BlockDeleteResult = z.object({
  id: z.string(),
  blockedId: UserId,
});
export type BlockDeleteResult = z.infer<typeof BlockDeleteResult>;

export const BlockListItem = z.object({
  id: z.string(),
  blockedId: UserId,
  blockedName: z.string(),
  createdAt: z.string().datetime(),
});
export type BlockListItem = z.infer<typeof BlockListItem>;

export const BlockListEnvelope = z.object({
  items: z.array(BlockListItem),
});
export type BlockListEnvelope = z.infer<typeof BlockListEnvelope>;
