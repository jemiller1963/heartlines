// @polsia:user-owned — matching-feed Profile API.
//
// requireAuth gates every method; the owner is the session user (never a
// request body field). 200 returns the user's profile; 204 if none yet so the
// client can branch cleanly on "edit your profile first". 400/404/409 produce
// the flat `{ errors: { field: msg } }` shape that `applyServerErrors`
// understands.
//
// lifestylePreferences and lifestyleCharacteristics are a compatibility
// bridge, not two matching dimensions: each field is read and written in its
// own column, with no implicit translation or scoring in this owner API.

import 'server-only';
import { NextResponse } from 'next/server';
import { ProfileCreate, ProfileItem, ProfilePatch } from '@/lib/contracts/profile';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

function profileShape(row: {
  id: string;
  userId: string;
  displayName: string | null;
  age: number;
  location: string;
  interests: string[];
  lifestylePreferences: string[];
  relationshipIntent?: string | null;
  distancePreference?: string | null;
  lifestyleCharacteristics?: string[];
  valuesPriorities?: string[];
  partnerPreferences?: string[];
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
    relationshipIntent: row.relationshipIntent ?? null,
    distancePreference: row.distancePreference ?? null,
    lifestyleCharacteristics: row.lifestyleCharacteristics ?? [],
    valuesPriorities: row.valuesPriorities ?? [],
    partnerPreferences: row.partnerPreferences ?? [],
    bio: row.bio ?? undefined,
    avatarUrl: row.avatarUrl ?? null,
    verificationStatus: row.verificationStatus ?? null,
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

  const row = await prisma.profile.findUnique({ where: { userId: auth.session.id } });
  if (!row) {
    // 204 No Content — client distinguishes "no profile yet" without parsing
    // an envelope.
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(profileShape(row));
}

export async function POST(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = ProfileCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }

  const existing = await prisma.profile.findUnique({
    where: { userId: auth.session.id },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { errors: { _form: 'You already have a profile. Use PATCH to update it.' } },
      { status: 409 },
    );
  }

  const created = await prisma.profile.create({
    data: {
      userId: auth.session.id,
      displayName: parsed.data.displayName ?? null,
      age: parsed.data.age,
      location: parsed.data.location,
      interests: parsed.data.interests,
      lifestylePreferences: parsed.data.lifestylePreferences ?? [],
      relationshipIntent: parsed.data.relationshipIntent ?? null,
      distancePreference: parsed.data.distancePreference ?? null,
      lifestyleCharacteristics: parsed.data.lifestyleCharacteristics ?? [],
      valuesPriorities: parsed.data.valuesPriorities ?? [],
      partnerPreferences: parsed.data.partnerPreferences ?? [],
      bio: parsed.data.bio ?? null,
    },
  });
  return NextResponse.json(profileShape(created), { status: 201 });
}

export async function PATCH(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = ProfilePatch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }

  const existing = await prisma.profile.findUnique({
    where: { userId: auth.session.id },
  });
  if (!existing) {
    return NextResponse.json(
      { errors: { _form: 'Create your profile before editing it.' } },
      { status: 404 },
    );
  }

  const {
    displayName,
    age,
    location,
    interests,
    lifestylePreferences,
    relationshipIntent,
    distancePreference,
    lifestyleCharacteristics,
    valuesPriorities,
    partnerPreferences,
    bio,
  } = parsed.data;
  const updated = await prisma.profile.update({
    where: { userId: auth.session.id },
    data: {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(age !== undefined ? { age } : {}),
      ...(location !== undefined ? { location } : {}),
      ...(interests !== undefined ? { interests } : {}),
      ...(lifestylePreferences !== undefined ? { lifestylePreferences } : {}),
      ...(relationshipIntent !== undefined ? { relationshipIntent } : {}),
      ...(distancePreference !== undefined ? { distancePreference } : {}),
      ...(lifestyleCharacteristics !== undefined ? { lifestyleCharacteristics } : {}),
      ...(valuesPriorities !== undefined ? { valuesPriorities } : {}),
      ...(partnerPreferences !== undefined ? { partnerPreferences } : {}),
      ...(bio !== undefined ? { bio } : {}),
    },
  });
  return NextResponse.json(profileShape(updated));
}
