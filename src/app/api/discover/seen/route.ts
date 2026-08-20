// @polsia:user-owned — matching-feed Discovery (pass) write API.
//
// requireAuth gates access. Viewer id is derived from the session — never
// trusted from the request body. Idempotent on the (viewerUserId,
// targetUserId) unique index: a re-Pass is a no-op (upsert with empty
// `update`).

import 'server-only';
import { NextResponse } from 'next/server';
import { DiscoverSeenCreate, DiscoverSeenResult } from '@/lib/contracts/discover';
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

  const parsed = DiscoverSeenCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }
  const { toUserId } = parsed.data;

  if (toUserId === auth.session.id) {
    return NextResponse.json(
      { errors: { toUserId: 'You cannot pass on yourself.' } },
      { status: 400 },
    );
  }

  const row = await prisma.discovery.upsert({
    where: {
      viewerUserId_targetUserId: {
        viewerUserId: auth.session.id,
        targetUserId: toUserId,
      },
    },
    create: {
      viewerUserId: auth.session.id,
      targetUserId: toUserId,
      status: 'seen',
      seenAt: new Date(),
    },
    update: {},
  });

  return NextResponse.json(
    DiscoverSeenResult.parse({
      id: row.id,
      viewerUserId: row.viewerUserId,
      targetUserId: row.targetUserId,
      seenAt: row.seenAt.toISOString(),
    }),
    { status: 201 },
  );
}
