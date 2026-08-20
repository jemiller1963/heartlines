// @polsia:user-owned — `GET /api/messages/threads`: list the signed-in user's
// active conversations ordered by most-recent activity.
//
// IDOR invariant — the query is purely `session.id`-scoped. There is NO
// `userId` taken from the request body or query string; the only source of
// the viewer id is the session. A future "list any user's threads" contributor
// must add an admin-only branch with explicit role gating, NOT relax the
// where-clause on this endpoint.
//
// Two-sided scan — `OR` over `userAId == session.id` / `userBId == session.id`.
// Both sides are indexed (`@@index([userAId, lastMessageAt DESC])` +
// `@@index([userBId, lastMessageAt DESC])`) so the planner can pick the
// cheaper side; under the canonical-pair invariant the planner's choice
// doesn't depend on which side the viewer is on.
//
// "Other participant" derivation — `session.id === userAId ? userBId : userAId`.
// The fallback matrix below is exercised by the unit test: FK races between
// the thread write and this read can produce a missing `User` or `Profile` row,
// and a brand-new thread has no `Message` rows yet.
//
// Four batched queries (threads → users → profiles → last-messages) — never an
// N+1 — keyed in JS with `Map`s, mirroring the data plane pattern at
// `src/app/api/admin/verifications/route.ts`.

import 'server-only';
import { NextResponse } from 'next/server';
import { MessageThreadsList } from '@/lib/contracts/messages';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const sessionId = auth.session.id;

  const threads = await prisma.messageThread.findMany({
    where: { OR: [{ userAId: sessionId }, { userBId: sessionId }] },
    orderBy: { lastMessageAt: 'desc' },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      lastMessageAt: true,
      createdAt: true,
    },
  });

  if (threads.length === 0) {
    return NextResponse.json(MessageThreadsList.parse({ items: [] }));
  }

  const peerIds = threads.map((t) => (t.userAId === sessionId ? t.userBId : t.userAId));
  const threadIds = threads.map((t) => t.id);

  const [users, profiles, messages] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: peerIds } },
      select: { id: true, name: true },
    }),
    prisma.profile.findMany({
      where: { userId: { in: peerIds } },
      select: {
        userId: true,
        age: true,
        location: true,
        avatarUrl: true,
        verificationStatus: true,
      },
    }),
    // Pulled newest-first per thread — the first row per threadId in the
    // resulting batch is the most-recent message (which is the preview the
    // tile renders). ThreadId is indexed with `createdAt DESC`, so even an
    // arbitrary read order would be cheap; ordering client-side keeps the
    // "first window per thread" semantics dead simple.
    prisma.message.findMany({
      where: { threadId: { in: threadIds } },
      orderBy: { createdAt: 'desc' },
      select: { threadId: true, senderId: true, body: true, createdAt: true },
    }),
  ]);

  const usersById = new Map(users.map((u) => [u.id, u]));
  const profilesByUserId = new Map(profiles.map((p) => [p.userId, p]));
  // messages is already newest-first per thread, so the FIRST entry we see
  // for any given threadId is the preview.
  const lastByThread = new Map<string, { senderId: string; body: string; createdAt: Date }>();
  for (const m of messages) {
    if (!lastByThread.has(m.threadId)) lastByThread.set(m.threadId, m);
  }

  const items = threads.map((t) => {
    const peerId = t.userAId === sessionId ? t.userBId : t.userAId;
    const u = usersById.get(peerId);
    const p = profilesByUserId.get(peerId);
    const last = lastByThread.get(t.id);
    return {
      id: t.id,
      userAId: t.userAId,
      userBId: t.userBId,
      lastMessageAt: t.lastMessageAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
      otherParticipant: {
        id: peerId,
        // Fallback: FK race between thread write and this read can land on
        // a User row that hasn't been visible yet — render empty string so
        // the UI shows a deterministic "—" fallback rather than undefined.
        name: u?.name ?? '',
        // Profile is optional — the peer may not have completed onboarding.
        // Honest nulls, not synthetic defaults.
        avatarUrl: p?.avatarUrl ?? null,
        verificationStatus: p?.verificationStatus ?? null,
        age: p?.age ?? null,
        city: p?.location ?? '',
      },
      // Brand-new thread (just upserted after a match) has no Message rows
      // yet — render null so the UI hides the preview row.
      lastMessage: last
        ? {
            body: last.body,
            createdAt: last.createdAt.toISOString(),
            senderId: last.senderId,
          }
        : null,
    };
  });

  return NextResponse.json(MessageThreadsList.parse({ items }));
}
