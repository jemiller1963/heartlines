// @polsia:user-owned — the only profile-state-to-entry mapping.

import type { MemberEntryDestination } from '@/lib/contracts/member-entry';

export type MemberReviewStatus = 'PENDING' | 'FLAGGED' | 'APPROVED';

export function memberEntryDestination(
  reviewStatus: MemberReviewStatus | null | undefined,
): MemberEntryDestination {
  if (!reviewStatus) return '/onboarding';
  return reviewStatus === 'APPROVED' ? '/feed' : '/review-status';
}
