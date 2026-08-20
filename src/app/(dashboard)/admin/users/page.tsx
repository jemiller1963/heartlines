// @polsia:user-owned — admin-only users management page.
//
// Mirrors the shape of /admin/profiles and /admin/verifications deliberately:
//   - Server Component that gates via `requireAdmin()` — non-admins typing the
//     URL directly get a server-side redirect (to /login if signed out, to / if
//     signed in but not admin).
//   - `metadata` deliberately not exported; admin routes are not for indexing.
//   - `dynamic = 'force-dynamic'` so SSR sees the freshest header against the
//     freshly fetched list.
//   - The data plane lives under /api/admin/users + /api/admin/users/[id] —
//     this page is markup-only. No Prisma reads, no `await fetch`, no
//     server-only imports. That keeps it inside the project's lint policy
//     (`noRestrictedImports` flags server-only modules in page.tsx).

import { UsersAdminList } from '@/components/custom/admin/users-admin-list';
import { requireAdmin } from '@/lib/admin-page-guard';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-eyebrow text-muted-foreground">Admin · Users</p>
        <h1 className="text-h2 text-foreground">User accounts</h1>
        <p className="text-body text-muted-foreground">
          Create new accounts, change a member's role, ban or restore access, and remove accounts
          that no longer belong on Heart Lines. Your changes apply immediately.
        </p>
      </header>
      <UsersAdminList />
    </div>
  );
}
