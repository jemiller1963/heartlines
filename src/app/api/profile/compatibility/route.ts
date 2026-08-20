// @polsia:user-owned — matching-feed compatibility API.
//
// GET /api/profile/compatibility?with=<userId> — server reads BOTH profiles
// (viewer from session, target from `with`), computes three-axis
// compatibility via the pure helper in @/lib/business/compatibility, and
// returns a zod-validated CompatibilityResult. Self-target is 403, target
// missing is 404, missing viewer profile is a 200 with neutral zeros (the
// endpoint is still useful as a placeholder for incomplete profiles). No
// Server Actions, no internal fetch — direct DB read inside the handler
// only.

import 'server-only';
import { NextResponse } from 'next/server';
import { type CompatibilityInputs, scoreCompatibility } from '@/lib/business/compatibility';
import { CompatibilityQuery, CompatibilityResult } from '@/lib/contracts/compatibility';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

function flattenError(err: import('zod').ZodError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(err.flatten().fieldErrors)
      .map(([field, messages]) => [field, messages?.[0] ?? ''])
      .filter(([, msg]) => Boolean(msg)),
  );
}

function toInputs(
  row: {
    age: number;
    location: string;
    interests: string[];
    bio: string | null;
  } | null,
): CompatibilityInputs {
  if (!row) {
    return { age: 0, location: '', interests: [], bio: null };
  }
  return { age: row.age, location: row.location, interests: row.interests, bio: row.bio };
}

const profileSelect = { age: true, location: true, interests: true, bio: true } as const;

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const parsed = CompatibilityQuery.safeParse({
    with: url.searchParams.get('with') ?? '',
  });
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }

  if (parsed.data.with === auth.session.id) {
    return NextResponse.json(
      { errors: { with: 'You cannot score compatibility with yourself.' } },
      { status: 403 },
    );
  }

  // Two independent reads: viewer first (for the prompt's expected mock order),
  // then target — a null target collapses to 404 with no leakage. A null
  // viewer is non-fatal; scoring falls back to neutral zeros.
  const [viewer, target] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: auth.session.id }, select: profileSelect }),
    prisma.profile.findUnique({ where: { userId: parsed.data.with }, select: profileSelect }),
  ]);
  if (!target) {
    return NextResponse.json({ errors: { with: 'Profile not found.' } }, { status: 404 });
  }

  const breakdown = scoreCompatibility(toInputs(viewer), toInputs(target));

  return NextResponse.json(
    CompatibilityResult.parse({
      viewerUserId: auth.session.id,
      targetUserId: parsed.data.with,
      values: breakdown.values,
      interests: breakdown.interests,
      lifestyle: breakdown.lifestyle,
      overall: breakdown.overall,
    }),
    { status: 200 },
  );
}
