// @polsia:user-owned — per-user PrivacyPrefs API.
//
// Gated by `requireAuth`. The owner is the session user (never a
// request body field). GET upserts a defaults row so the client always
// receives a populated item; PATCH upserts with the caller's data.

import 'server-only';
import { NextResponse } from 'next/server';
import { PrivacyItem, PrivacyPatch } from '@/lib/contracts/privacy';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

function shape(row: {
  id: string;
  userId: string;
  profilePublic: boolean;
  hideLastActive: boolean;
  hideReadReceipts: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return PrivacyItem.parse({
    id: row.id,
    userId: row.userId,
    profilePublic: row.profilePublic,
    hideLastActive: row.hideLastActive,
    hideReadReceipts: row.hideReadReceipts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function flattenError(err: import('zod').ZodError): Record<string, string> {
  const fieldErrors = err.flatten().fieldErrors;
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    const first = messages?.[0];
    if (first) out[field] = first;
  }
  return out;
}

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const row = await prisma.privacyPreferences.upsert({
    where: { userId: auth.session.id },
    update: {},
    create: {
      userId: auth.session.id,
      profilePublic: true,
      hideLastActive: false,
      hideReadReceipts: false,
    },
  });
  return NextResponse.json(shape(row));
}

export async function PATCH(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = PrivacyPatch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }

  const { profilePublic, hideLastActive, hideReadReceipts } = parsed.data;
  const row = await prisma.privacyPreferences.upsert({
    where: { userId: auth.session.id },
    update: {
      ...(profilePublic !== undefined ? { profilePublic } : {}),
      ...(hideLastActive !== undefined ? { hideLastActive } : {}),
      ...(hideReadReceipts !== undefined ? { hideReadReceipts } : {}),
    },
    create: {
      userId: auth.session.id,
      profilePublic: profilePublic ?? true,
      hideLastActive: hideLastActive ?? false,
      hideReadReceipts: hideReadReceipts ?? false,
    },
  });
  return NextResponse.json(shape(row));
}
