// @polsia:user-owned — shared zod contract for the matching-feed discover
// resource. Client-importable (zod only — no server-only imports).

import { z } from 'zod';
import { ProfileItem } from './profile';
import { UserId } from './swipe';

export const DiscoverMatchItem = z.object({
  profile: ProfileItem,
  // Better-auth `User.name` for the candidate — read on the server, supplied
  // in the payload. May be empty; the UI shows a deterministic fallback.
  name: z.string(),
  score: z.number().min(0).max(100),
  // Same definition as `FeedItem.sharedInterests` — exact-string normalized
  // matches between the viewer's and candidate's interests (computed via
  // `interestOverlap` in `@/lib/business/matching`).
  sharedInterests: z.array(z.string()),
});
export type DiscoverMatchItem = z.infer<typeof DiscoverMatchItem>;

export const DiscoverResult = z.object({
  matches: z.array(DiscoverMatchItem),
  nextCursor: z.string().nullable(),
  hasProfile: z.boolean(),
});
export type DiscoverResult = z.infer<typeof DiscoverResult>;

export const DiscoverQuery = z.object({
  // Profile.id IS a Prisma cuid (starts with "c"), unlike better-auth User.id.
  cursor: z.string().cuid().optional(),
});
export type DiscoverQuery = z.infer<typeof DiscoverQuery>;

// Discovery (seen/pass) write — viewer is derived from session, not body.
export const DiscoverSeenCreate = z.object({
  toUserId: UserId,
});
export type DiscoverSeenCreate = z.infer<typeof DiscoverSeenCreate>;

export const DiscoverSeenResult = z.object({
  id: z.string(),
  viewerUserId: UserId,
  targetUserId: UserId,
  seenAt: z.string().datetime(),
});
export type DiscoverSeenResult = z.infer<typeof DiscoverSeenResult>;

// Connection (intent-to-connect) write.
export const ConnectionCreate = z.object({
  toUserId: UserId,
});
export type ConnectionCreate = z.infer<typeof ConnectionCreate>;

export const ConnectionResult = z.object({
  id: z.string(),
  fromUserId: UserId,
  toUserId: UserId,
  createdAt: z.string().datetime(),
});
export type ConnectionResult = z.infer<typeof ConnectionResult>;

// AI conversation-starter suggestions on the match card. Body carries ONLY
// the target id — overlap is recomputed server-side so client and server
// cannot drift.
export const ConversationStartersRequest = z.object({
  toUserId: UserId,
});
export type ConversationStartersRequest = z.infer<typeof ConversationStartersRequest>;

export const ConversationStartersResult = z.object({
  starters: z.array(z.string().min(1).max(280)).length(3),
  // `generated`  -> AI produced prompts grounded in shared interests.
  // `no-overlap` -> AI produced neutral prompts anchored on profile facts
  //                 when the viewer/target share no hobbies.
  // `fallback`   -> AI errored / parse failed; hard-coded neutral openers.
  reason: z.enum(['generated', 'no-overlap', 'fallback']).optional(),
});
export type ConversationStartersResult = z.infer<typeof ConversationStartersResult>;
