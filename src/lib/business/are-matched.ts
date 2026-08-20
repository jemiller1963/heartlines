// @polsia:user-owned — match-membership helper for cross-feature auth gates.
//
// A "match" between two users is inferred from two existing module seams:
//
//   1. **Matching seam** — both directions have a `Swipe` row with
//      `decision = ACCEPT`. The `Swipe` index `@@unique([fromUserId, toUserId])`
//      means an ACCEPT from A → B and an ACCEPT from B → A are TWO separate
//      rows, so we look up the (a→b) and (b→a) rows independently. Both
//      `fromUserId` and `toUserId` are indexed (`@@index([fromUserId])`,
//      `@@index([toUserId])`) so each lookup is a single indexed read.
//
//   2. **Discovery/connection seam** — an explicit `Connection` row exists
//      between the pair (either direction). `@@unique([fromUserId, toUserId])`
//      enforces one row per direction, so we check both (from=a,to=b) and
//      (from=b,to=a).
//
// The helper returns `true` if EITHER seam reports a match. Two cheap, single-
// read queries; meant to be called inside an authed `/api` route handler.
// A future endpoint that asks "are these two users matched" (e.g. before
// scheduling a video date, opening a message thread, etc.) MUST reuse this
// helper rather than re-deriving the rules.

import 'server-only';
import { prisma } from '@/lib/db';

export async function areMatched(a: string, b: string): Promise<boolean> {
  if (a === b) return false;
  const [abSwipe, baSwipe, abConn, baConn] = await Promise.all([
    prisma.swipe.findFirst({
      where: { fromUserId: a, toUserId: b, decision: 'ACCEPT' },
      select: { id: true },
    }),
    prisma.swipe.findFirst({
      where: { fromUserId: b, toUserId: a, decision: 'ACCEPT' },
      select: { id: true },
    }),
    prisma.connection.findFirst({
      where: { fromUserId: a, toUserId: b },
      select: { id: true },
    }),
    prisma.connection.findFirst({
      where: { fromUserId: b, toUserId: a },
      select: { id: true },
    }),
  ]);
  return Boolean(abSwipe && baSwipe) || Boolean(abConn) || Boolean(baConn);
}
