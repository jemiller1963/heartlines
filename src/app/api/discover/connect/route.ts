// @polsia:user-owned — matching-feed Connection (intent-to-connect) write API.
//
// requireAuth gates access. Viewer id is derived from the session — never
// trusted from the request body. Idempotent on the (fromUserId, toUserId)
// unique index (mirror of /api/swipe): 200 if a row already exists, 201 on
// the first create; concurrent clicks from the same viewer are resolved by
// the index and follow up to return the winning row.

import 'server-only';
import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { ConnectionCreate, ConnectionResult } from '@/lib/contracts/discover';
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

  const parsed = ConnectionCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }
  const { toUserId } = parsed.data;

  if (toUserId === auth.session.id) {
    return NextResponse.json(
      { errors: { toUserId: 'You cannot connect with yourself.' } },
      { status: 400 },
    );
  }

  function shape(row: { id: string; fromUserId: string; toUserId: string; createdAt: Date }) {
    return ConnectionResult.parse({
      id: row.id,
      fromUserId: row.fromUserId,
      toUserId: row.toUserId,
      createdAt: row.createdAt.toISOString(),
    });
  }

  const existing = await prisma.connection.findUnique({
    where: { fromUserId_toUserId: { fromUserId: auth.session.id, toUserId } },
  });
  if (existing) {
    return NextResponse.json(shape(existing), { status: 200 });
  }

  try {
    const created = await prisma.connection.create({
      data: { fromUserId: auth.session.id, toUserId },
    });
    return NextResponse.json(shape(created), { status: 201 });
  } catch (err) {
    // Concurrent connection from the same user on the same target — race
    // resolved by the unique index. Look up the winning row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.connection.findUnique({
        where: { fromUserId_toUserId: { fromUserId: auth.session.id, toUserId } },
      });
      if (winner) return NextResponse.json(shape(winner), { status: 200 });
    }
    return NextResponse.json({ error: 'Could not record connection' }, { status: 500 });
  }
}
