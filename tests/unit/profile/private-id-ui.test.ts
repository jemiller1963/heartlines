// @vitest-environment node
// @polsia:user-owned — source-level wiring guards for private ID verification.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string) {
  return readFileSync(path, 'utf8');
}

describe('private ID verification UI and route boundaries', () => {
  it('uses presigned private upload without consuming or rendering the returned Blob URL', () => {
    const uploader = source('src/components/custom/verification-id-uploader.tsx');
    expect(uploader).toContain("import { uploadPresigned } from '@vercel/blob/client'");
    expect(uploader).toContain("access: 'private'");
    expect(uploader).toContain("handleUploadUrl: '/api/profile/verification-id'");
    expect(uploader).not.toContain('blob.url');
    expect(uploader).not.toContain('downloadUrl');
  });

  it('surfaces the uploader during review status', () => {
    const review = source(
      'src/app/(member-entry)/review-status/review-status-screen.tsx',
    );
    expect(review).toContain('<VerificationIdUploader />');
  });

  it('server-gates the verification review page before rendering', () => {
    const page = source('src/app/(dashboard)/admin/verifications/page.tsx');
    expect(page).toContain("import { requireAdmin } from '@/lib/admin-page-guard'");
    expect(page).toContain('await requireAdmin()');
  });

  it('makes retained image metadata nullable and records review time', () => {
    const schema = source('prisma/schema/profile.prisma');
    const migration = source(
      'prisma/migrations/20260922000100_private_id_retention/migration.sql',
    );
    expect(schema).toContain('imagePath   String?');
    expect(schema).toContain('reviewedAt  DateTime?');
    expect(migration).toContain('ALTER COLUMN "imagePath" DROP NOT NULL');
    expect(migration).toContain('ADD COLUMN "reviewedAt" TIMESTAMP(3)');
  });
});
