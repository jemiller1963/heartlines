// @polsia:user-owned — server-only helper that computes the safety-based
// exclusion set for candidate queries (both-direction blocks + privacy-hidden
// profiles). Called by both the feed and discover/matches routes so the rules
// live in one place.
import 'server-only';
import { prisma } from '@/lib/db';

/**
 * Returns a Set of userId values that must be excluded from candidate queries
 * for safety reasons:
 *   - Users who have blocked the viewer (they should not appear to viewer)
 *   - Users the viewer has blocked (viewer explicitly hid them)
 *   - Users who set profilePublic = false (opted out of discovery)
 *
 * Does NOT include route-specific exclusions (swiped, recently-seen); those
 * are the caller's responsibility.
 */
export async function getCandidateSafetyExcludes(viewerUserId: string): Promise<Set<string>> {
  const [outgoing, incoming, hiddenPrivacy] = await Promise.all([
    // viewer → candidate blocks (viewer explicitly blocked them)
    prisma.block.findMany({
      where: { blockerId: viewerUserId },
      select: { blockedId: true },
    }),
    // candidate → viewer blocks (candidate blocked the viewer)
    prisma.block.findMany({
      where: { blockedId: viewerUserId },
      select: { blockerId: true },
    }),
    // profiles hidden from discovery
    prisma.privacyPreferences.findMany({
      where: { profilePublic: false },
      select: { userId: true },
    }),
  ]);

  const excluded = new Set<string>();
  for (const row of outgoing) excluded.add(row.blockedId);
  for (const row of incoming) excluded.add(row.blockerId);
  for (const row of hiddenPrivacy) excluded.add(row.userId);
  return excluded;
}
