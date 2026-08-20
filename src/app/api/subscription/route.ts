// @polsia:user-owned — `GET /api/subscription`: returns the viewer's
// subscription status as parsed by the shared `SubscriptionStatus` contract.
// Sole consumer: client islands (dashboard badge, conversation page banner,
// video-sessions inbox). The same contract is imported by both this route
// and the islands so a shape drift is a ZodError at the parse boundary.

import 'server-only';
import { NextResponse } from 'next/server';
import { getSubscriptionForUser } from '@/lib/business/subscription';
import { SubscriptionStatus } from '@/lib/contracts/subscription';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const view = await getSubscriptionForUser(auth.session);
  const payload = SubscriptionStatus.parse(view);
  return NextResponse.json(payload, { status: 200 });
}
