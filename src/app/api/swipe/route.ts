// @polsia:user-owned — matching-feed Swipe API.

import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { SwipeCreate, SwipeResult } from '@/lib/contracts/swipe';
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

export async function POST(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = SwipeCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }
  const { toUserId, decision } = parsed.data;

  if (toUserId === auth.session.id) {
    return NextResponse.json(
      { errors: { toUserId: 'You cannot swipe on yourself.' } },
      { status: 400 },
    );
  }

  // The (fromUserId, toUserId) unique index makes the write idempotent. If a
  // row exists, fetch + return it; only create on the first attempt.
  function shape(row: {
    id: string;
    fromUserId: string;
    toUserId: string;
    decision: 'ACCEPT' | 'REJECT';
    createdAt: Date;
  }) {
    return SwipeResult.parse({
      id: row.id,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      decision: row.decision,
      createdAt: row.createdAt.toISOString(),
    });
  }

  const existing = await prisma.swipe.findUnique({
    where: { fromUserId_toUserId: { fromUserId: auth.session.id, toUserId } },
  });
  if (existing) {
    return NextResponse.json(shape(existing), { status: 200 });
  }

  try {
    const created = await prisma.swipe.create({
      data: { fromUserId: auth.session.id, toUserId, decision },
    });
    return NextResponse.json(shape(created), { status: 201 });
  } catch (err) {
    // Concurrent swipe from the same user on the same target — race resolved
    // by the unique index. Look up the winning row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.swipe.findUnique({
        where: { fromUserId_toUserId: { fromUserId: auth.session.id, toUserId } },
      });
      if (winner) return NextResponse.json(shape(winner), { status: 200 });
    }
    return NextResponse.json({ error: 'Could not record swipe' }, { status: 500 });
  }
}
