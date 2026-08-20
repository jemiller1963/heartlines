// @polsia:user-owned — admin-only listing of recently created profiles for
// the moderation review queue.
//
// Joins two tables (Profile, User) by SCALAR id — never a Prisma `@relation`
// back to `User` (auth.prisma is framework-owned and the ownership gate
// forbids adding back-relations). The merge happens in JS keyed by `userId`.
//
// Gates inline (auth.api.getSession + role === 'admin') — returns 401/403
// rather than redirecting, because a redirect turns a fetch into a 307 that
// the client island can't render. The future page wrapper will use
// `requireAdmin()` for the redirect-on-arrival path; this endpoint is the
// live mutation surface.

import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { AdminProfileList } from '@/lib/contracts/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const profiles = await prisma.profile.findMany({
    select: {
      id: true,
      userId: true,
      age: true,
      location: true,
      createdAt: true,
      reviewStatus: true,
      avatarUrl: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Hydrate the owner User for `displayName`. Scalar-by-id only — a Prisma
  // `@relation` back to `User` would force a back-relation field on the
  // framework-owned `User` model and the gate rejects it. Skip the round
  // trip entirely when the page is empty so the empty-list branch stays
  // observable in the test (no user.findMany call expected).
  const users =
    profiles.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: profiles.map((p) => p.userId) } },
          select: { id: true, name: true },
        });
  const usersById = new Map(users.map((u) => [u.id, u]));

  const items = profiles.map((p) => ({
    id: p.id,
    displayName: usersById.get(p.userId)?.name ?? null,
    age: p.age,
    city: p.location,
    createdAt: p.createdAt.toISOString(),
    reviewStatus: p.reviewStatus,
    avatarUrl: p.avatarUrl,
  }));

  const body = AdminProfileList.parse({ items });
  return NextResponse.json(body);
}
