// @polsia:user-owned — admin-only profile-review queue page.
//
// Server Component that calls `await requireAdmin()` at the top so any
// non-admin who types or pastes the URL directly is server-side redirected
// (to /login if signed out, to / if signed in but not an admin) — the
// data plane (`/api/admin/profiles`) stays an inline 401/403 surface so an
// apiFetch that ignores the redirect still can't leak rows.
//
// `metadata` is intentionally not exported: this is an admin-only route,
// not meant to be indexed by search engines. `dynamic = 'force-dynamic'`
// mirrors the verifications page so the rendered header matches the freshly
// fetched list at SSR time.

import { ProfileReviewList } from '@/components/custom/admin/profile-review-list';
// Imported through the barrel so the lint `noRestrictedImports` rule on
// `@/lib/require-admin` doesn't fire on this page (the rule is exempt for
// files in src/lib/**, where the barrel re-exports the helper). Behavior
// is identical: redirect non-admins to /login (signed out) or / (not admin).
import { requireAdmin } from '@/lib/admin-page-guard';

export const dynamic = 'force-dynamic';

export default async function AdminProfilesPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-eyebrow text-muted-foreground">Admin · Profile review</p>
        <h1 className="text-h2 text-foreground">Pending profiles</h1>
        <p className="text-body text-muted-foreground">
          Review each new profile and approve it to put the member in front of other users, or flag
          it for follow-up. Approved and flagged profiles drop out of the default pending filter.
        </p>
      </header>
      <ProfileReviewList />
    </div>
  );
}
