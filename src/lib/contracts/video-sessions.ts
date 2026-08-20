// @polsia:user-owned — shared zod contract for the video-sessions resource
// (`POST /api/video-sessions`, `GET /api/video-sessions`, and the
// `PATCH /api/video-sessions/[id]` status-transition handler). Imported by
// BOTH the route handlers and any future client island that posts a "start
// call" intent, lists pending calls, or wires the accept/decline/cancel/end
// affordances. A shape drift surfaces as a tsc / rwc ZodError at the parse
// boundary.
//
// Keep client-importable: zod only — no server-only imports.

import { z } from 'zod';
import { UserId } from './swipe';

// Status membership is mirrored from the Prisma `VideoSessionStatus` enum
// (`prisma/schema/video-sessions.prisma`). Kept as a separately-validated
// zod enum so the contract doesn't have to be re-deployed when the prisma
// enum gains a value.
export const VideoSessionStatus = z.enum(['PENDING', 'ACTIVE', 'ENDED', 'CANCELLED']);
export type VideoSessionStatus = z.infer<typeof VideoSessionStatus>;

export const VideoSessionId = z.string().cuid();
export type VideoSessionId = z.infer<typeof VideoSessionId>;

// --- write contract ---------------------------------------------------------

export const VideoSessionCreate = z.object({
  toUserId: UserId,
});
export type VideoSessionCreate = z.infer<typeof VideoSessionCreate>;

// Status-transition input for `PATCH /api/video-sessions/[id]`. The action
// verb is the wire contract; the route handler is the sole source of the
// legal-transition table (PENDING→ACTIVE/ENDED/CANCELLED + ACTIVE→ENDED).
// Anything else is a 400.
export const VideoSessionPatch = z.object({
  action: z.enum(['accept', 'decline', 'cancel', 'end']),
});
export type VideoSessionPatch = z.infer<typeof VideoSessionPatch>;

// --- read contract ----------------------------------------------------------

// "Other participant" summary on the inbox tile. Mirrors the messaging
// `OtherParticipantSummary` shape so a future consumer can render the two
// tile types with the same row component. Re-declared (not re-exported from
// `./messages`) so this contract stays self-contained — Zod's `pick`/spread
// would force a cross-file coupling the build gate would still tolerate,
// but a copy is more honest about the surface area we own here.
export const OtherParticipantSummary = z.object({
  id: UserId,
  // better-auth `User.name` — may be empty string if the User row raced
  // (FK race between session write and read). Never null so the UI treats
  // empty names uniformly (renders "—").
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  // Mirrors Profile.verificationStatus (string, not the zod enum, so the
  // contract doesn't have to be re-deployed when the enum gains a value).
  verificationStatus: z.string().nullable(),
  age: z.number().int().nullable(),
  // Mapped from Profile.location. Empty string when the peer has no
  // Profile row yet (UI shows "—" rather than undefined).
  city: z.string(),
});
export type OtherParticipantSummary = z.infer<typeof OtherParticipantSummary>;

export const VideoSessionResult = z.object({
  id: VideoSessionId,
  userAId: UserId,
  userBId: UserId,
  // The participant who CREATED this session. The inbox page derives the
  // "Outgoing" vs "Incoming" direction chip from this column
  // (`senderId === viewerId` → outgoing). Without it, the canonical
  // `[a,b].sort()` pair discipline makes the original sender unrecoverable.
  senderId: UserId,
  status: VideoSessionStatus,
  roomUrl: z.string().min(1),
  startAt: z.string().datetime().nullable(),
  endAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  // Embedded by `GET /api/video-sessions` (the inbox list), absent from the
  // `POST` / `PATCH` response (those paths don't pay for two batched lookups).
  // `.optional()` so the SAME schema parses both light + enriched shapes —
  // the inbox page only renders rows where this is present.
  otherParticipant: OtherParticipantSummary.optional(),
});
export type VideoSessionResult = z.infer<typeof VideoSessionResult>;

// List-item reuses the single-row shape — keeps the read contract in lockstep
// with the POST output, so a drift surfaces as a ZodError at the parse
// boundary instead of silently diverging.
export const VideoSessionListItem = VideoSessionResult;
export type VideoSessionListItem = z.infer<typeof VideoSessionListItem>;

export const VideoSessionList = z.object({ items: z.array(VideoSessionListItem) });
export type VideoSessionList = z.infer<typeof VideoSessionList>;
