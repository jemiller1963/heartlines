// @polsia:user-owned — `GET /api/messages/[threadId]/messages`: paginated
// message history for a single conversation thread, ordered newest-first.
//
// IDOR invariant — identical to the POST sibling: `threadId` is re-fetched by
// id and `session.id` is verified against `userAId`/`userBId` before any
// message rows are read. A non-participant gets 403, not 404, to avoid leaking
// thread existence to an attacker who guesses the cuid.
//
// Cursor pagination — Prisma native cursor on `Message.id` with `skip: 1` to
// exclude the cursor row itself. `nextCursor` is the last returned item's id
// when the probe row `PAGE_SIZE + 1` exists, else null.
//
// Sender name join — two-step scalar-FK read: `message.senderId` then a
// batched `user.findMany`. FK-race rows default to '' so the handler never
// throws on a missing user.

import 'server-only';
import { NextResponse } from 'next/server';
import { MessageHistoryPage, MessageHistoryQuery, MessageThreadId } from '@/lib/contracts/messages';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const { threadId } = await params;
  const idCheck = MessageThreadId.safeParse(threadId);
  if (!idCheck.success) {
    return NextResponse.json({ errors: { threadId: 'Invalid thread id' } }, { status: 400 });
  }

  const url = new URL(req.url);
  const cursorRaw = url.searchParams.get('cursor') ?? undefined;
  const queryCheck = MessageHistoryQuery.safeParse({ cursor: cursorRaw });
  if (!queryCheck.success) {
    return NextResponse.json(
      { errors: { cursor: queryCheck.error.issues[0]?.message ?? 'Invalid cursor' } },
      { status: 400 },
    );
  }
  const cursor = queryCheck.data.cursor;

  const thread = await prisma.messageThread.findUnique({
    where: { id: threadId },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!thread) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }

  if (auth.session.id !== thread.userAId && auth.session.id !== thread.userBId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rows = await prisma.message.findMany({
    where: { threadId },
    orderBy: { createdAt: 'desc' },
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: PAGE_SIZE + 1,
    select: { id: true, threadId: true, senderId: true, body: true, createdAt: true },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE);

  const senderIds = [...new Set(items.map((m) => m.senderId))];
  const users =
    senderIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: senderIds } },
          select: { id: true, name: true },
        })
      : [];
  const nameById = new Map(users.map((u) => [u.id, u.name ?? '']));

  const payload = MessageHistoryPage.parse({
    items: items.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      senderId: m.senderId,
      senderName: nameById.get(m.senderId) ?? '',
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    })),
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  });

  return NextResponse.json(payload, { status: 200 });
}
