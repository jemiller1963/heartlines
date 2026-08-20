// @polsia:user-owned — Server Component shell for /profile (the bare route).
//
// Page responsibilities (server-only):
//   - export `metadata` for SEO / browser-tab title.
//   - gate via session: signed-in → `redirect('/profile/<own-id>')` so the
//     existing viewer at `(dashboard)/profile/[id]/page.tsx` owns the page;
//     signed-out → `redirect('/login')` so unauthenticated visitors don't
//     land on the (auth)/profile form.
//
// No Prisma reads, no `await fetch`, no `next/headers` direct import — the
// session read goes through `getSessionUser()` from `@/lib/require-auth`
// (server-only and the same helper the existing admin/Site auth flow uses).

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/require-auth';

export const metadata: Metadata = {
  title: 'Your profile',
};

export default async function ProfileIndexPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  redirect(`/profile/${user.id}`);
}
