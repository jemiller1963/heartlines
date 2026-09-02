// @polsia:user-owned — authenticated profile-state entry decision.

import 'server-only';

import { NextResponse } from 'next/server';
import { MemberEntryResponse } from '@/lib/contracts/member-entry';
import { prisma } from '@/lib/db';
import { memberEntryDestination } from '@/lib/member-entry';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const profile = await prisma.profile.findUnique({
    where: { userId: auth.session.id },
    select: { reviewStatus: true },
  });

  return NextResponse.json(
    MemberEntryResponse.parse({
      destination: memberEntryDestination(profile?.reviewStatus),
    }),
  );
}
