// @polsia:user-owned — admin-only ID-verification review queue page.
//
// Server Component that renders the interactive client island inside the
// inherited `(dashboard)/layout.tsx` DashboardShell. Gates live at the edges:
//   - DashboardShell already redirects signed-out visitors to /login.
//   - The API route handlers /api/admin/verifications[GET] and
//     /api/admin/verifications/[userId][POST] enforce 401/403 inline so a
//     non-admin typing the URL directly never sees the queue data.
//   - The dashboard sidebar hides the "ID Review" link for non-admin users.
//
// The page itself is markup-only — no Prisma reads, no `await fetch`, no
// server-only imports. That keeps it inside the project's lint policy
// (`noRestrictedImports` flags server-only modules in page.tsx but exempts
// route.ts/layout.tsx/ src/lib/**). Data plane is the pair of /api handlers.
//
// `metadata` is intentionally not exported: this is an admin-only route, not
// meant to be indexed by search engines.

import { VerificationReviewList } from '@/components/custom/admin/verification-review-list';

export const dynamic = 'force-dynamic';

export default function AdminVerificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-eyebrow text-muted-foreground">Admin · ID review</p>
        <h1 className="text-h2 text-foreground">Pending verifications</h1>
        <p className="text-body text-muted-foreground">
          Review each submission side-by-side with the uploaded government ID, then approve or
          reject. Approved and rejected members drop out of this queue automatically.
        </p>
      </header>
      <VerificationReviewList />
    </div>
  );
}
