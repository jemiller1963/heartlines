// @polsia:user-owned — public-by-auth profile fetch by user id.
//
// GET /api/profile/<userId> — viewer must be authed; resolves the target
// profile by userId scalar (no @relation back to User). 404 when the target
// has no profile row yet; 200 returns the full ProfileItem shape (used by
// /profile/[id] to render any member's basics). Self-target is allowed so
// the same island renders /profile/<ownUserId>.

import 'server-only';
import { NextResponse } from 'next/server';
import { ProfileItem } from '@/lib/contracts/profile';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

function shape(row: {
  id: string;
  userId: string;
  displayName: string | null;
  age: number;
  location: string;
  interests: string[];
  lifestylePreferences: string[];
  bio: string | null;
  avatarUrl: string | null;
  verificationStatus: 'unverified' | 'pending' | 'approved' | 'rejected' | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return ProfileItem.parse({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName ?? null,
    age: row.age,
    location: row.location,
    interests: row.interests,
    lifestylePreferences: row.lifestylePreferences,
    bio: row.bio ?? undefined,
    avatarUrl: row.avatarUrl ?? null,
    verificationStatus: row.verificationStatus ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const { id } = await params;

  const row = await prisma.profile.findUnique({ where: { userId: id } });
  if (!row) {
    return NextResponse.json({ errors: { _form: 'Profile not found.' } }, { status: 404 });
  }
  return NextResponse.json(shape(row));
}
