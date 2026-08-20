// @polsia:user-owned — Server Component shell for /profile/[id]. Inherits
// the (dashboard) group's DashboardShell, which handles the unauthenticated
// → /login redirect. The page itself does NOT fetch data — the
// `ProfileView` island reads /api/profile/[id] and the `CompatibilityPanel`
// island reads /api/profile/compatibility on mount via apiFetch. This file
// stays a pure composition shell (a `'use server'` or top-level Prisma fetch
// would violate the data-plane rules; biome `noRestrictedImports` enforces
// no server-only imports here).

import type { Metadata } from 'next';
import { CompatibilityPanel } from '@/components/custom/profile/compatibility-panel';
import { ProfileView } from '@/components/custom/profile/profile-view';

export const metadata: Metadata = {
  title: 'Member profile',
};

interface ProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function ProfilePage({ params }: ProfilePageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <ProfileView targetUserId={id} />
      <CompatibilityPanel targetUserId={id} />
    </div>
  );
}
