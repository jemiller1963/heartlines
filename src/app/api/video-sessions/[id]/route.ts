// @polsia:user-owned — `PATCH /api/video-sessions/[id]`: status-transition a
// VideoSession. Imported and consumed by future client islands that wire
// the `accept` / `decline` / `cancel` / `end` affordances.
//
// Mirrors the participant-gate + body-parse + shape-parse pattern from
// `src/app/api/messages/[threadId]/route.ts` (dynamic route, schema-driven
// body validation, response-shaped via the same `VideoSessionResult`
// contract as POST).
//
// IDOR invariant — the `id` path segment is NOT trusted: any user can craft
// a URL with someone else's cuid, so we re-fetch the row by id and compare
// `session.id` against `userAId` and `userBId` before doing anything else.
// The participant check happens BEFORE the body parse so an unauthenticated
// probe gets 401 and a non-participant probe gets 403, neither of which
// leaks whether the body would have validated.
//
// `senderId` is now stored on the row (`POST` writes it; the inbox page
// reads it to derive the direction chip). The legal-transition matrix is
// the load-bearing gate; participant symmetry is intentional so a future
// contributor can narrow `accept`/`decline` to the non-sender side by
// adding the sender check, without re-shaping the response shape.
//
// Guard order: auth (401) → cuid check (400) → fetch → 404 (missing) →
// participant gate (403) → body parse (400) → transition table (200 or
// 400 illegal) → subscription gate (402, ONLY when the next state is
// ACTIVE — i.e. when the action is `accept`). `decline` / `cancel` /
// `end` stay ungated so a free user can always clean up their inbox.

import 'server-only';
import { NextResponse } from 'next/server';
import { requireSubscription } from '@/lib/business/subscription';
import {
  VideoSessionId,
  VideoSessionPatch,
  VideoSessionResult,
} from '@/lib/contracts/video-sessions';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const idCheck = VideoSessionId.safeParse(id);
  if (!idCheck.success) {
    return NextResponse.json({ errors: { id: 'Invalid session id' } }, { status: 400 });
  }

  const existing = await prisma.videoSession.findUnique({
    where: { id },
    select: { id: true, userAId: true, userBId: true, status: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (auth.session.id !== existing.userAId && auth.session.id !== existing.userBId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = VideoSessionPatch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { errors: { action: 'pick accept, decline, cancel, or end' } },
      { status: 400 },
    );
  }

  const now = new Date();
  let next: 'ACTIVE' | 'ENDED' | 'CANCELLED';
  let patch: { startAt?: Date; endAt?: Date } = {};

  switch (`${existing.status}:${parsed.data.action}`) {
    case 'PENDING:accept':
      next = 'ACTIVE';
      patch = { startAt: now };
      break;
    case 'PENDING:decline':
    case 'PENDING:cancel':
      next = 'CANCELLED';
      patch = {};
      break;
    case 'ACTIVE:end':
      next = 'ENDED';
      patch = { endAt: now };
      break;
    default:
      return NextResponse.json(
        {
          errors: {
            action: `Illegal transition: ${existing.status} → ${parsed.data.action}`,
          },
        },
        { status: 400 },
      );
  }

  // Subscription gate: only the `accept` action joins an active call, so
  // only that transition is gated. `decline`/`cancel`/`end` flow through
  // unchanged so a free user can always clean up.
  if (parsed.data.action === 'accept') {
    try {
      await requireSubscription(auth.session);
    } catch (res) {
      return res as Response;
    }
  }

  const updated = await prisma.videoSession.update({
    where: { id },
    data: { status: next, ...patch },
  });

  const payload = VideoSessionResult.parse({
    id: updated.id,
    userAId: updated.userAId,
    userBId: updated.userBId,
    senderId: updated.senderId,
    status: updated.status,
    roomUrl: updated.roomUrl,
    startAt: updated.startAt?.toISOString() ?? null,
    endAt: updated.endAt?.toISOString() ?? null,
    createdAt: updated.createdAt.toISOString(),
  });

  return NextResponse.json(payload, { status: 200 });
}
