// @polsia:user-owned — authenticated public profile fetch by user id.
//
// GET /api/profile/<userId> — viewer must be authed; resolves the target
// profile by userId scalar (no @relation back to User). 404 when the target
// has no profile row yet; 200 returns only the explicit PublicProfile shape
// used by /profile/[id] to render any member's basics. Self-target is allowed
// so the same island renders /profile/<ownUserId>.

import 'server-only';
import { NextResponse } from 'next/server';
import { PublicProfile } from '@/lib/contracts/profile-public';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;

  const row = await prisma.profile.findUnique({
    where: { userId: id },
    select: {
      id: true,
      userId: true,
      displayName: true,
      age: true,
      location: true,
      interests: true,
      lifestylePreferences: true,
      bio: true,
      avatarUrl: true,
      verificationStatus: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!row) {
    return NextResponse.json({ errors: { _form: 'Profile not found.' } }, { status: 404 });
  }

  return NextResponse.json(
    PublicProfile.parse({
      id: row.id,
      userId: row.userId,
      displayName: row.displayName,
      age: row.age,
      location: row.location,
      interests: row.interests,
      lifestylePreferences: row.lifestylePreferences,
      bio: row.bio,
      avatarUrl: row.avatarUrl,
      verificationStatus: row.verificationStatus,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
}
