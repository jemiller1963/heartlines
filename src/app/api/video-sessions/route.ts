// @polsia:user-owned — `POST /api/video-sessions`: create a `PENDING`
// VideoSession between the signed-in user and another user they have a
// match with (defined in `@/lib/business/are-matched`).
//
// `GET /api/video-sessions`: list sessions where the authed user is
// either `userAId` OR `userBId`, ordered by `createdAt` DESC, defaulting
// to `status === 'PENDING'` with an optional `?status=` override. Gated
// with `authOrResponse` (401 on miss).
//
// IDOR invariant — the participant pair is derived from `session.id` and
// the body's `toUserId` only. The request body MUST NOT carry a `userAId`
// or `userBId`; the server is the sole source of the viewer id (session).
//
// `roomUrl` — opaque server-generated room token (`crypto.randomUUID()`).
// A future provider integration (Daily / Twilio / LiveKit) replaces this
// generator + may add a token-signing middleware; the contract shape does
// NOT carry a provider choice.
//
// Canonical-pair invariant — the `[a, b].sort()` discipline mirrors
// `MessageThread` (`prisma/schema/messages.prisma`). Even though this slice
// doesn't enforce a `@@unique([userAId, userBId])` index, the writer MUST
// sort the pair so a future concurrent POST from both sides doesn't race
// past the index constraint — the next contributor adding the @@unique
// shouldn't have to retrofit the route.

import 'server-only';
import { NextResponse } from 'next/server';
import { areMatched } from '@/lib/business/are-matched';
import { requireSubscription } from '@/lib/business/subscription';
import {
  VideoSessionCreate,
  VideoSessionList,
  VideoSessionResult,
  VideoSessionStatus,
} from '@/lib/contracts/video-sessions';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { videoSessionRequest } from '@/lib/email/templates';
import { env } from '@/lib/env';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

function flattenError(err: import('zod').ZodError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(err.flatten().fieldErrors)
      .map(([field, messages]) => [field, messages?.[0] ?? ''])
      .filter(([, msg]) => Boolean(msg)),
  );
}

export async function POST(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = VideoSessionCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }
  const { toUserId } = parsed.data;

  if (toUserId === auth.session.id) {
    return NextResponse.json(
      { errors: { toUserId: 'You cannot start a video date with yourself.' } },
      { status: 400 },
    );
  }

  const matched = await areMatched(auth.session.id, toUserId);
  if (!matched) {
    return NextResponse.json(
      { errors: { toUserId: 'You can only start a video date with a match.' } },
      { status: 403 },
    );
  }

  try {
    await requireSubscription(auth.session);
  } catch (res) {
    return res as Response;
  }

  const sortedPair = [auth.session.id, toUserId].sort();
  const [userAId, userBId] = sortedPair as [string, string];
  const roomUrl = crypto.randomUUID();

  const created = await prisma.videoSession.create({
    data: {
      userAId,
      userBId,
      // Record the inviter so the inbox page can derive the direction chip
      // (senderId === viewerId → "Outgoing"). Without this column the
      // canonical `[a,b].sort()` pair discipline makes sender unrecoverable.
      senderId: auth.session.id,
      roomUrl,
    },
  });

  // Notify the recipient — best-effort. The row is committed and the API
  // contract just needs to report it; an outbound-email failure must NOT
  // roll the session back or block the response.
  try {
    const recipient = await prisma.user.findUnique({
      where: { id: toUserId },
      select: { email: true, name: true },
    });
    if (recipient?.email) {
      const senderName = auth.session.name?.trim() || 'Someone';
      const sessionUrl = `${env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}/video-sessions`;
      await sendEmail({
        to: recipient.email,
        ...videoSessionRequest({
          senderName,
          recipientName: recipient.name?.trim() || 'there',
          sessionUrl,
        }),
      });
    }
  } catch (_err) {}

  const payload = VideoSessionResult.parse({
    id: created.id,
    userAId: created.userAId,
    userBId: created.userBId,
    senderId: created.senderId,
    status: created.status,
    roomUrl: created.roomUrl,
    startAt: created.startAt?.toISOString() ?? null,
    endAt: created.endAt?.toISOString() ?? null,
    createdAt: created.createdAt.toISOString(),
  });

  return NextResponse.json(payload, { status: 200 });
}

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const rawStatus = url.searchParams.get('status');
  // The wire value is the lowercase form (`?status=pending`) the brief
  // writes in; the Prisma enum + contract are uppercase. Uppercase-trim
  // so a lowercase curl works AND the canonical stored value aligns.
  let status: VideoSessionStatus;
  if (rawStatus) {
    const parsed = VideoSessionStatus.safeParse(rawStatus.toUpperCase().trim());
    if (!parsed.success) {
      return NextResponse.json({ errors: { status: 'Invalid status' } }, { status: 400 });
    }
    status = parsed.data;
  } else {
    status = 'PENDING';
  }

  const rows = await prisma.videoSession.findMany({
    where: {
      OR: [{ userAId: auth.session.id }, { userBId: auth.session.id }],
      status,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      senderId: true,
      status: true,
      roomUrl: true,
      startAt: true,
      endAt: true,
      createdAt: true,
    },
  });

  // Embed the "other participant" summary so the inbox page can render
  // name/avatar/age/city without a follow-up round trip per row. Two
  // batched lookups (users + profiles) — never N+1 — keyed in JS with
  // Map, mirroring `src/app/api/messages/threads/route.ts`.
  const peerIds = rows.map((row) => (row.userAId === auth.session.id ? row.userBId : row.userAId));

  const [users, profiles] =
    peerIds.length === 0
      ? [
          [] as Array<{ id: string; name: string }>,
          [] as Array<{
            userId: string;
            age: number | null;
            location: string | null;
            avatarUrl: string | null;
            verificationStatus: string | null;
          }>,
        ]
      : await Promise.all([
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
        ]);

  const usersById = new Map(users.map((u) => [u.id, u]));
  const profilesByUserId = new Map(profiles.map((p) => [p.userId, p]));

  const payload = VideoSessionList.parse({
    items: rows.map((row) => {
      const peerId = row.userAId === auth.session.id ? row.userBId : row.userAId;
      const u = usersById.get(peerId);
      const p = profilesByUserId.get(peerId);
      return {
        id: row.id,
        userAId: row.userAId,
        userBId: row.userBId,
        senderId: row.senderId,
        status: row.status,
        roomUrl: row.roomUrl,
        startAt: row.startAt?.toISOString() ?? null,
        endAt: row.endAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        otherParticipant: {
          id: peerId,
          // FK race landed on a User that hasn't surfaced yet — render
          // empty string so the row is deterministic, not undefined.
          name: u?.name ?? '',
          // Profile is optional — peer may not have completed onboarding.
          avatarUrl: p?.avatarUrl ?? null,
          verificationStatus: p?.verificationStatus ?? null,
          age: p?.age ?? null,
          city: p?.location ?? '',
        },
      };
    }),
  });

  return NextResponse.json(payload, { status: 200 });
}
