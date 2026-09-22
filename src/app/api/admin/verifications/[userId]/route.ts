// @polsia:user-owned — admin-only approve/reject for one pending submission.
//
// Raw government-ID images are retained only while a submission is pending.
// The private Blob is deleted before the decision transaction; then both status
// rows are updated, imagePath is cleared, and reviewedAt is recorded.

import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  BlobConfigurationError,
  deletePrivateBlobOrThrow,
  getVerificationBlobToken,
} from '@/lib/business/blob-storage';
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

  const [profile, submission] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: { id: true, userId: true, age: true, location: true, verificationStatus: true },
    }),
    prisma.idVerification.findUnique({
      where: { userId },
      select: { imagePath: true, status: true },
    }),
  ]);

  if (!profile || !submission) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (profile.verificationStatus !== 'pending' || submission.status !== 'pending') {
    return NextResponse.json({ error: 'Already reviewed' }, { status: 409 });
  }
  if (!submission.imagePath) {
    return NextResponse.json({ error: 'Verification image unavailable' }, { status: 409 });
  }

  try {
    await deletePrivateBlobOrThrow(submission.imagePath, getVerificationBlobToken());
  } catch (error) {
    const status = error instanceof BlobConfigurationError ? 503 : 502;
    // biome-ignore lint/suspicious/noConsole: retain a server-side retention failure audit trail.
    console.error('Could not delete reviewed verification image.', error);
    return NextResponse.json({ error: 'Could not finalize verification review' }, { status });
  }

  const next: 'approved' | 'rejected' = action === 'approve' ? 'approved' : 'rejected';
  const reviewedAt = new Date();

  await prisma.$transaction([
    prisma.profile.update({
      where: { userId },
      data: { verificationStatus: next },
    }),
    prisma.idVerification.update({
      where: { userId },
      data: { status: next, imagePath: null, reviewedAt },
    }),
  ]);

  const [updatedProfile, updatedSubmission, user] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: { userId: true, age: true, location: true },
    }),
    prisma.idVerification.findUnique({
      where: { userId },
      select: { status: true, submittedAt: true },
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
    imagePath: `/api/admin/verifications/${encodeURIComponent(userId)}/image`,
    status: updatedSubmission.status,
  });
  return NextResponse.json(item);
}
