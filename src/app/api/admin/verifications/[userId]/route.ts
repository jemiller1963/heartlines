// @polsia:user-owned — admin-only approve/reject for one pending submission.
//
// Flips BOTH Profile.verificationStatus AND IdVerification.status inside a
// single transaction so the two rows never drift. 409 if the row is no longer
// pending so retries / double-taps don't silently rewrite state.
//
// Gates inline (auth.api.getSession + role === 'admin') — returns 401/403
// rather than redirecting. Returns the post-mutation merged item so the client
// island can drop the row in place without refetching the list.

import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  AdminVerificationDecision,
  AdminVerificationItem,
} from '@/lib/contracts/admin-verification';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const parsed = AdminVerificationDecision.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: { action: 'pick approve or reject' } }, { status: 400 });
  }
  const { action } = parsed.data;

  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { id: true, userId: true, age: true, location: true, verificationStatus: true },
  });
  if (!profile) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (profile.verificationStatus !== 'pending') {
    return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
  }

  const next: 'approved' | 'rejected' = action === 'approve' ? 'approved' : 'rejected';

  await prisma.$transaction([
    prisma.profile.update({
      where: { userId },
      data: { verificationStatus: next },
    }),
    prisma.idVerification.update({
      where: { userId },
      data: { status: next },
    }),
  ]);

  // Re-read to return the published row shape exactly once, including timestamps
  // and the verified user row (id/name/email).
  const [updatedProfile, updatedSubmission, user] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: { userId: true, age: true, location: true },
    }),
    prisma.idVerification.findUnique({
      where: { userId },
      select: { imagePath: true, status: true, submittedAt: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    }),
  ]);

  if (!updatedProfile || !updatedSubmission) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const item = AdminVerificationItem.parse({
    userId,
    name: user?.name ?? null,
    email: user?.email ?? null,
    age: updatedProfile.age,
    location: updatedProfile.location,
    submittedAt: updatedSubmission.submittedAt.toISOString(),
    imagePath: updatedSubmission.imagePath,
    status: updatedSubmission.status,
  });
  return NextResponse.json(item);
}
