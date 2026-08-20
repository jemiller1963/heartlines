// @polsia:user-owned — admin approve/flag for one profile row.
//
// Flips Profile.reviewStatus (PENDING → APPROVED or FLAGGED) inside a single
// update; re-reads the row so the wire response carries the freshly persisted
// state instead of operator-side guesswork. Returns the post-mutation merged
// item so the client island can patch the row in place without refetching
// the list.
//
// Gates inline (auth.api.getSession + role === 'admin') — returns 401/403
// rather than redirecting. requireAdmin() redirects, which turns the client
// island's `apiFetch` into a 307 the island cannot render.
//
// Joins Profile → User by SCALAR id only (no Prisma `@relation` back to User).
// auth.prisma is framework-owned and the ownership gate forbids a back-relation
// field on it.

import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { AdminProfileDecision, AdminProfileListItem } from '@/lib/contracts/admin';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const parsed = AdminProfileDecision.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: { action: 'pick approve or flag' } }, { status: 400 });
  }
  const { action } = parsed.data;

  // Existence check — 404 if the row is gone (404 also covers "row exists but
  // caller can't see it", same shape as the verifications endpoint).
  const existing = await prisma.profile.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const next: 'APPROVED' | 'FLAGGED' = action === 'approve' ? 'APPROVED' : 'FLAGGED';

  await prisma.profile.update({
    where: { id },
    data: { reviewStatus: next },
    select: { id: true },
  });

  // Re-read so the serialized response carries the freshly persisted state
  // (including the @updatedAt bump Prisma manages for us) rather than a
  // operator-merged guess. Same call shape → same row, same columns.
  const updated = await prisma.profile.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      age: true,
      location: true,
      createdAt: true,
      reviewStatus: true,
      avatarUrl: true,
    },
  });
  if (!updated) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const owner = await prisma.user.findUnique({
    where: { id: updated.userId },
    select: { name: true },
  });

  const item = AdminProfileListItem.parse({
    id: updated.id,
    displayName: owner?.name ?? null,
    age: updated.age,
    city: updated.location,
    createdAt: updated.createdAt.toISOString(),
    reviewStatus: updated.reviewStatus,
    avatarUrl: updated.avatarUrl,
  });
  return NextResponse.json(item, { status: 200 });
}
