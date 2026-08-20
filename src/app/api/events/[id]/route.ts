// @polsia:user-owned — DELETE /api/events/[id]. Host-only cancel.
// @polsia:user-owned — GET /api/events/[id]. Auth-gated single-event fetch.
//
// Auth gate (`authOrResponse`) → 401 on miss.
// Param trim/idempotency → 400 on empty id after trim.
// Existence check (`prisma.event.findUnique`) → 404 on missing row.
// Host equality (`event.userId === session.id`) → 403 on mismatch — DELETE only.
// Otherwise `prisma.event.delete` and respond 204 with an empty body (DELETE),
// or compute `currentAttendees` via `prisma.eventRsvp.count` and respond 200 with
// an `EventDetail`-shaped body (GET).
//
// Cascade: `EventRsvp.eventId` is intentionally a scalar String with no
// `onDelete`, so RSVPs on a deleted event become orphaned scalars. This
// matches the accepted tradeoff documented in `prisma/schema/events.prisma`.

import 'server-only';
import { NextResponse } from 'next/server';
import { EventDetail } from '@/lib/contracts/events';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const { id: rawId } = await params;
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const row = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      hostName: true,
      startTime: true,
      city: true,
      maxAttendees: true,
    },
  });
  if (!row) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const currentAttendees = await prisma.eventRsvp.count({ where: { eventId: id } });

  return NextResponse.json(
    EventDetail.parse({
      id: row.id,
      hostId: row.userId,
      title: row.title,
      hostName: row.hostName,
      startTime: row.startTime.toISOString(),
      city: row.city,
      maxAttendees: row.maxAttendees,
      currentAttendees,
    }),
  );
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const { id: rawId } = await params;
  const id = typeof rawId === 'string' ? rawId.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'Missing event id' }, { status: 400 });
  }

  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!event) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (event.userId !== auth.session.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.event.delete({ where: { id } });

  return new Response(null, { status: 204 });
}
