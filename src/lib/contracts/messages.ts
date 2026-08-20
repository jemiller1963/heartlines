// @polsia:user-owned — shared zod contract for the in-app messaging
// conversation-list resource (`GET /api/messages/threads`). Imported by BOTH
// the route handler and the future `/messages` client island; a shape drift
// surfaces as a tsc / rwc ZodError at the parse boundary.
//
// Keep client-importable: zod only — no server-only imports. The contract
// intentionally does NOT reuse `ProfileItem` from `./profile` — ProfileItem
// includes `bio`, `interests`, and other PII the messaging surface shouldn't
// surface; `OtherParticipantSummary` is a narrow summary tailored to a
// conversation tile (no bio / interests — those belong on a profile page).

import { z } from 'zod';
import { UserId } from './swipe';

// better-auth User.id is a longer base36 string, not a strict cuid — we
// validate the shape (non-empty, length cap) rather than the format. See
// `src/lib/contracts/swipe.ts` for the full rationale.

export const MessageThreadId = z.string().cuid();

const MessagePreview = z.object({
  body: z.string(),
  createdAt: z.string().datetime(),
  senderId: UserId,
});
export type MessagePreview = z.infer<typeof MessagePreview>;

// Other participant summary — exactly the six fields `/messages` renders per
// tile. `verificationStatus` mirrors Profile.verificationStatus (nullable so
// pre-deploy rows or pending self-write still parse). `age`/`avatarUrl`/
// `verificationStatus` are NULLABLE so a thread whose peer has no Profile row
// yet (FK race or pure signup) renders an honest empty tile rather than a
// synthetic profile.
const OtherParticipantSummary = z.object({
  id: UserId,
  // Better-auth `User.name` — may be empty (the empty-string fallback the
  // route uses when the FK race lost). Never null so the UI treats empty
  // names uniformly.
  name: z.string(),
  avatarUrl: z.string().url().nullable(),
  // Mirrors Profile.verificationStatus (string, not the zod enum, so the
  // contract doesn't have to be re-deployed when the enum gains a value).
  verificationStatus: z.string().nullable(),
  age: z.number().int().nullable(),
  // Mapped from Profile.location. Empty string when the peer has no
  // Profile row yet (UI shows "—" instead of an undefined gap).
  city: z.string(),
});
export type OtherParticipantSummary = z.infer<typeof OtherParticipantSummary>;

const MessageThreadSummary = z.object({
  id: MessageThreadId,
  userAId: UserId,
  userBId: UserId,
  lastMessageAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  otherParticipant: OtherParticipantSummary,
  // Null for a brand-new thread that hasn't received its first message yet
  // (a match like any other, but discussion hasn't started).
  lastMessage: z.union([MessagePreview, z.null()]),
});
export type MessageThreadSummary = z.infer<typeof MessageThreadSummary>;

export const MessageThreadsList = z.object({
  items: z.array(MessageThreadSummary),
});
export type MessageThreadsList = z.infer<typeof MessageThreadsList>;

// --- send-message write contract --------------------------------------------
//
// Used by `POST /api/messages/[threadId]` AND its future client island. Zod
// only — keep client-importable (no server-only imports).

export const MessageSend = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long'),
});
export type MessageSend = z.infer<typeof MessageSend>;

export const Message = z.object({
  id: z.string().cuid(),
  threadId: MessageThreadId,
  senderId: UserId,
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type Message = z.infer<typeof Message>;

// Flat single-resource wrapper — mirrors SwipeResult so the client island can
// plug the response into the same shape it already renders on the swipe feed.
export const MessageResult = Message;
export type MessageResult = z.infer<typeof MessageResult>;

// --- message history read contract -----------------------------------------

export const MessageItem = z.object({
  id: z.string().cuid(),
  threadId: MessageThreadId,
  senderId: UserId,
  senderName: z.string(), // '' when the User row is missing (FK race)
  body: z.string(),
  createdAt: z.string().datetime(),
});
export type MessageItem = z.infer<typeof MessageItem>;

export const MessageHistoryQuery = z.object({
  cursor: z.string().cuid().optional(), // Message.id of the last item on the previous page
});
export type MessageHistoryQuery = z.infer<typeof MessageHistoryQuery>;

export const MessageHistoryPage = z.object({
  items: z.array(MessageItem),
  nextCursor: z.string().cuid().nullable(),
});
export type MessageHistoryPage = z.infer<typeof MessageHistoryPage>;

// `MessageDetail` is the per-message shape the in-app conversation page
// needs (used on `/messages/[threadId]`). It is exactly the same as the
// existing `MessageItem` (per-thread history row); aliased (not renamed)
// so existing code that imports `MessageItem` keeps working and the
// client island's name matches its semantic role.

export const MessageDetail = MessageItem;
export type MessageDetail = z.infer<typeof MessageDetail>;
