// @polsia:user-owned — Events collection API: POST creates one owned by the
// authed user; GET returns the shared listing (events are not user-private
// content, so the read is NOT scoped by userId).
//
// POST contract:
//   gated by `authOrResponse` → 401 on miss
//   zod-parses `EventCreate` → 400 with `{ errors: { field: msg } }`
//   inserts via `prisma.event.create({ data: { userId: session.id, ... } })`
//   fires a `sendEmail` confirmation to the host (best-effort; failure does
//   NOT convert the 201 into a 5xx)
//   returns 201 with `EventCreated` (attendeeCount: 0)
// GET contract:
//   gated by `authOrResponse` → 401 on miss
//   cursor-paced pagination ordered by startTime ASC (matches EventQuery)
//   batched `prisma.eventRsvp.groupBy` to compute attendeeCount per event
//   returns 200 with `EventList`
//
// unwrap prisma errors → 500 (matches the profile route's shape); no P2002
// or P2025 to catch here because the insert never collides (cuid id) and we
// never delete.

import 'server-only';
import { NextResponse } from 'next/server';
import {
  EventCreate,
  EventCreated,
  EventList as EventListSchema,
  EventQuery,
} from '@/lib/contracts/events';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { eventCreatedEmail } from '@/lib/email/templates';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

function flattenError(err: import('zod').ZodError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(err.flatten().fieldErrors)
      .map(([field, messages]) => [field, messages?.[0] ?? ''])
      .filter(([, msg]) => Boolean(msg)),
  );
}

const PAGE_SIZE = 20;

export async function POST(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = EventCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }

  const body = parsed.data;
  const row = await prisma.event.create({
    data: {
      userId: auth.session.id,
      title: body.title,
      hostName: body.hostName,
      startTime: new Date(body.startTime),
      city: body.city,
      maxAttendees: body.maxAttendees,
    },
  });

  await sendHostConfirmation({
    to: auth.session.email,
    hostName: row.hostName,
    eventTitle: row.title,
    city: row.city,
    startTime: row.startTime,
  });

  return NextResponse.json(
    EventCreated.parse({
      id: row.id,
      hostId: row.userId,
      title: row.title,
      hostName: row.hostName,
      startTime: row.startTime.toISOString(),
      city: row.city,
      attendeeCount: 0,
    }),
    { status: 201 },
  );
}

async function sendHostConfirmation(input: {
  to: string;
  hostName: string;
  eventTitle: string;
  city: string;
  startTime: Date;
}): Promise<void> {
  try {
    await sendEmail({
      to: input.to,
      ...eventCreatedEmail({
        hostName: input.hostName,
        eventTitle: input.eventTitle,
        city: input.city,
        startTime: input.startTime,
      }),
    });
  } catch {
    // Swallow: a failed email send MUST NOT fail the event-create response.
  }
}

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const cursor = EventQuery.safeParse({ cursor: url.searchParams.get('cursor') ?? undefined }).data
    ?.cursor;

  const rows = await prisma.event.findMany({
    orderBy: { startTime: 'asc' },
    take: PAGE_SIZE,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const counts = new Map<string, number>();
  if (rows.length > 0) {
    const grouped = await prisma.eventRsvp.groupBy({
      by: ['eventId'],
      where: { eventId: { in: rows.map((r) => r.id) } },
      _count: { _all: true },
    });
    for (const g of grouped) counts.set(g.eventId, g._count._all);
  }

  const items = rows.map((row) =>
    EventListSchema.shape.items.element.parse({
      id: row.id,
      hostId: row.userId,
      title: row.title,
      hostName: row.hostName,
      startTime: row.startTime.toISOString(),
      city: row.city,
      attendeeCount: counts.get(row.id) ?? 0,
    }),
  );

  return NextResponse.json(
    EventListSchema.parse({
      items,
      nextCursor: items.length === PAGE_SIZE ? (items[items.length - 1]?.id ?? null) : null,
    }),
    { status: 200 },
  );
}
