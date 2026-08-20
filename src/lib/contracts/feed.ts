// @polsia:user-owned — shared zod contract for the matching-feed feed
// resource. Keep client-importable: zod only.

import { z } from 'zod';
import { ProfileItem } from './profile';

export const FeedItem = z.object({
  profile: ProfileItem,
  matchScore: z.number().min(0).max(100),
  sharedInterests: z.array(z.string()),
});
export type FeedItem = z.infer<typeof FeedItem>;

export const FeedList = z.object({
  items: z.array(FeedItem),
  nextCursor: z.string().nullable(),
  hasProfile: z.boolean(),
});
export type FeedList = z.infer<typeof FeedList>;

export const FeedQuery = z.object({
  // Profile.id IS a Prisma cuid (starts with "c"), unlike better-auth User.id.
  cursor: z.string().cuid().optional(),
});
export type FeedQuery = z.infer<typeof FeedQuery>;
