// @polsia:user-owned — admin-only listing of pending ID verifications.
//
// Joins three tables (Profile, IdVerification, User) by SCALAR id — never a
// Prisma `@relation` back to `User` (auth.prisma is framework-owned and the
// ownership gate forbids adding back-relations). The merge happens in JS keyed
// by `userId`.
//
// Gates inline (auth.api.getSession + role === 'admin') — returns 401/403
// rather than redirecting, because a redirect turns a fetch into a 307 that
// the client island can't render. The page wrapper at
// src/app/(dashboard)/admin/verifications/page.tsx still uses `requireAdmin()`
// for the redirect-on-arrival path; this endpoint is for the live mutation.

import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { AdminVerificationList } from '@/lib/contracts/admin-verification';
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
    where: { verificationStatus: 'pending' },
    select: {
      id: true,
      userId: true,
      age: true,
      location: true,
      createdAt: true,
    },
  });

  const submissions = await prisma.idVerification.findMany({
    where: { userId: { in: profiles.map((p) => p.userId) } },
    select: { userId: true, imagePath: true, status: true, submittedAt: true },
  });
  const submissionsByUser = new Map(submissions.map((s) => [s.userId, s]));

  const users =
    profiles.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: profiles.map((p) => p.userId) } },
          select: { id: true, name: true, email: true },
        });
  const usersById = new Map(users.map((u) => [u.id, u]));

  const items = profiles
    .map((p) => {
      const sub = submissionsByUser.get(p.userId);
      if (!sub) return null;
      const u = usersById.get(p.userId);
      return {
        userId: p.userId,
        name: u?.name ?? null,
        email: u?.email ?? null,
        age: p.age,
        location: p.location,
        submittedAt: sub.submittedAt.toISOString(),
        imagePath: sub.imagePath,
        status: sub.status,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  // Oldest first — fairness for the reviewer's queue.
  items.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  const body = AdminVerificationList.parse({ items });
  return NextResponse.json(body);
}
