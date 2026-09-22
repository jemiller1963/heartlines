// @polsia:user-owned — admin-only ID-verification review queue page.
//
// The page is server-gated with requireAdmin() before rendering. The backing
// APIs repeat 401/403 checks so neither navigation nor direct API calls can
// expose the private verification queue to a non-admin.

import { VerificationReviewList } from '@/components/custom/admin/verification-review-list';
import { requireAdmin } from '@/lib/admin-page-guard';

export const dynamic = 'force-dynamic';

export default async function AdminVerificationsPage() {
  await requireAdmin();
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-eyebrow text-muted-foreground">Admin · ID review</p>
        <h1 className="text-h2 text-foreground">Pending verifications</h1>
        <p className="text-body text-muted-foreground">
          Review each submission side-by-side with the uploaded government ID, then approve or
          reject. The raw ID image is deleted as soon as the decision is recorded.
        </p>
      </header>
      <VerificationReviewList />
    </div>
  );
}
