// @polsia:user-owned — POST /api/events/[id]/rsvp — idempotent RSVP upsert.
//
// Authed-only (gate via shared `authOrResponse`). Returns the existing
// `EventRsvp` row on duplicate calls (`eventId_userId` upsert key with
// `update: {}`) — duplicate RSVPs land on the `update: {}` path and return
// 200 with the SAME row, not a fresh one. No read-before-write dance, no
// P2002 catch — Prisma handles concurrent identical upserts natively.
//
// `eventId` is the opaque path param. The schema does not enforce that
// `eventId` corresponds to an `Event` row — there is no `Event` table in
// scope, and per `nextjs-prisma` SKILL the FK is a scalar String by design.
// A 200 on an unknown event id is the accepted tradeoff (and aligns with
// the brief's "duplicate calls return 200 without error" requirement).

import 'server-only';
import { NextResponse } from 'next/server';
import { EventRsvpResult } from '@/lib/contracts/events';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOrResponse(_req);
  if (!auth.ok) return auth.res;

  const { id } = await params;
  const eventId = typeof id === 'string' ? id.trim() : '';
  if (!eventId) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const row = await prisma.eventRsvp.upsert({
    where: { eventId_userId: { eventId, userId: auth.session.id } },
    create: { eventId, userId: auth.session.id },
    update: {},
  });

  return NextResponse.json(
    EventRsvpResult.parse({
      id: row.id,
      eventId: row.eventId,
      userId: row.userId,
      createdAt: row.createdAt.toISOString(),
    }),
    { status: 200 },
  );
}
