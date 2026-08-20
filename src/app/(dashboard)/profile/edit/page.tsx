// @polsia:user-owned — Server Component shell for /profile/edit. Inherits
// the (dashboard) group's DashboardShell which redirects unauthed visits to
// /login. The page itself does NOT fetch data — the form island reads and
// writes /api/profile and /api/profile/avatar on its own. Stays a pure
// composition shell (no `await prisma`, no `await fetch`, no `next/headers`).
// biome's `noRestrictedImports` HARD-FAILS the build if any of those
// server-only modules are imported here.

import type { Metadata } from 'next';
import { ProfileEditForm } from '@/components/custom/profile/profile-edit-form';

export const metadata: Metadata = {
  title: 'Edit profile',
};

export default function ProfileEditPage() {
  return <ProfileEditForm />;
}
