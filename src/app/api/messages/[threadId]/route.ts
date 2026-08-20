// @polsia:user-owned — `POST /api/messages/[threadId]`: append a Message to
// one of the viewer's conversations and bump `MessageThread.lastMessageAt`
// so the inbox listing reorders correctly.
//
// IDOR invariant — the participant check is the only gate. The `threadId`
// path segment is NOT trusted: any user can craft a URL with someone else's
// cuid, so we re-fetch the row by id and compare `session.id` against
// `userAId` and `userBId` before doing anything else. The check happens
// BEFORE the body parse so an unauthenticated probe gets 401 and a
// non-participant probe gets 403, neither of which leaks whether the body
// would have validated.
//
// `senderId` invariant — always the session id. The request body MUST NOT
// carry a senderId; even if a component were added to the contract later,
// the server should override it. This is the single load-bearing rule of
// "trust the session, not the body".
//
// Atomic write — Message.create + MessageThread.update run in a single
// `prisma.$transaction` so the listing-side per-side indexes
// (`@@index([userAId, lastMessageAt DESC])`, `@@index([userBId, lastMessageAt DESC])`)
// and the per-message `@@index([threadId, createdAt DESC])` see a consistent
// (threadId → newest-message, thread → new recency) state under concurrent
// reads; otherwise a read between the two writes would see the new message
// but not yet the bumped `lastMessageAt`, and the inbox would briefly
// misorder.
//
// Paywall — messaging requires an active Heart Lines Premium subscription.
// Guard order: auth → idCheck → fetch → participant → subscription → body
// parse → write. The subscription check sits AFTER the participant gate
// (an unauthorized probe gets 403, not a 402 that would silently reveal
// they're a participant) and BEFORE the body parse so a free user without a
// subscription gets a clean 402 on any text length.

import 'server-only';
import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/business/subscription';
import { MessageResult, MessageSend, MessageThreadId } from '@/lib/contracts/messages';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

function flattenError(err: import('zod').ZodError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(err.flatten().fieldErrors)
      .map(([field, messages]) => [field, messages?.[0] ?? ''])
      .filter(([, msg]) => Boolean(msg)),
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const { threadId } = await params;
  const idCheck = MessageThreadId.safeParse(threadId);
  if (!idCheck.success) {
    return NextResponse.json({ errors: { threadId: 'Invalid thread id' } }, { status: 400 });
  }

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

  try {
    await requireSubscription(auth.session);
  } catch (res) {
    return res as Response;
  }

  const parsed = MessageSend.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }

  const now = new Date();
  const [created] = await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId,
        senderId: auth.session.id,
        body: parsed.data.body,
      },
    }),
    prisma.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: now },
    }),
  ]);

  const payload = MessageResult.parse({
    id: created.id,
    threadId: created.threadId,
    senderId: created.senderId,
    body: created.body,
    createdAt: created.createdAt.toISOString(),
  });

  return NextResponse.json(payload, { status: 200 });
}
