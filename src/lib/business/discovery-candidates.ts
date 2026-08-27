// @polsia:user-owned — canonical server-side discovery candidate pool.
// Selection stays separate from compatibility scoring so every discovery
// endpoint applies the same hard eligibility and safety rules.
import 'server-only';
import type { Profile } from '@prisma/client';
import { getCandidateSafetyExcludes } from '@/lib/business/candidate-query';
import { prisma } from '@/lib/db';

const SEEN_WINDOW_MS = 30 * 86_400_000;

export interface DiscoveryCandidateOptions {
  viewerUserId: string;
  cursor?: string | null;
  limit: number;
}

/**
 * Selects raw Profile rows eligible for a discovery endpoint.
 *
 * The route's authenticated session supplies viewerUserId. This service owns
 * only hard eligibility and safety exclusions; compatibility scoring belongs
 * to the route that shapes its response.
 */
export async function getEligibleDiscoveryCandidates({
  viewerUserId,
  cursor,
  limit,
}: DiscoveryCandidateOptions): Promise<Profile[]> {
  const [safetyExcludes, swiped, recentlySeen, outgoingConnections] = await Promise.all([
    getCandidateSafetyExcludes(viewerUserId),
    prisma.swipe.findMany({
      where: { fromUserId: viewerUserId },
      select: { toUserId: true },
    }),
    prisma.discovery.findMany({
      where: {
        viewerUserId,
        status: 'seen',
        seenAt: { gte: new Date(Date.now() - SEEN_WINDOW_MS) },
      },
      select: { targetUserId: true },
    }),
    prisma.connection.findMany({
      where: { fromUserId: viewerUserId },
      select: { toUserId: true },
    }),
  ]);

  const excluded = new Set<string>([viewerUserId, ...safetyExcludes]);
  for (const row of swiped) excluded.add(row.toUserId);
  for (const row of recentlySeen) excluded.add(row.targetUserId);
  for (const row of outgoingConnections) excluded.add(row.toUserId);

  return prisma.profile.findMany({
    where: {
      age: { gte: 50 },
      id: cursor ? { gt: cursor } : undefined,
      reviewStatus: 'APPROVED',
      userId: { notIn: [...excluded] },
    },
    orderBy: { id: 'asc' },
    take: limit,
  });
}
