// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })),
}));

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  prisma: {
    profile: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

const root = process.cwd();
const source = (file: string) => readFileSync(join(root, file), 'utf8');

beforeEach(() => {
  vi.resetAllMocks();
  mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });
});

describe('Epic 5 draft-versus-review boundary', () => {
  it('models new profiles as DRAFT without rewriting existing submitted states', () => {
    const schema = source('prisma/schema/profile.prisma');
    const migration = source(
      'prisma/migrations/20261023000100_profile_review_draft/migration.sql',
    );

    expect(schema).toMatch(/enum ReviewStatus\s*{[\s\S]*?DRAFT[\s\S]*?PENDING/);
    expect(schema).toContain('reviewStatus      ReviewStatus       @default(DRAFT)');
    expect(migration).toContain("('DRAFT', 'PENDING', 'APPROVED', 'FLAGGED')");
    expect(migration).toContain('SET DEFAULT \'DRAFT\'');
    expect(migration).not.toMatch(/UPDATE\s+"Profile"/i);
  });

  it('routes a saved questionnaire draft back to onboarding', async () => {
    const { memberEntryDestination } = await import('@/lib/member-entry');
    expect(memberEntryDestination('DRAFT')).toBe('/onboarding');
    expect(memberEntryDestination('PENDING')).toBe('/review-status');
    expect(memberEntryDestination('APPROVED')).toBe('/feed');
  });

  it('excludes DRAFT from the admin moderation query', async () => {
    mocks.prisma.profile.findMany.mockResolvedValue([]);
    const { GET } = await import('@/app/api/admin/profiles/route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.prisma.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          reviewStatus: { in: ['PENDING', 'APPROVED', 'FLAGGED'] },
        },
      }),
    );
  });

  it('refuses a direct admin moderation action against a DRAFT profile', async () => {
    mocks.prisma.profile.findUnique.mockResolvedValueOnce({
      id: 'profile-draft',
      reviewStatus: 'DRAFT',
    });

    const { PATCH } = await import('@/app/api/admin/profiles/[id]/route');
    const request = new Request('http://localhost/api/admin/profiles/profile-draft', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    const response = await PATCH(request, {
      params: Promise.resolve({ id: 'profile-draft' }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'Profile has not been submitted for review.',
    });
    expect(mocks.prisma.profile.update).not.toHaveBeenCalled();
  });

  it('uses an explicit save lock and accessible grouped controls in onboarding', () => {
    const onboarding = source('src/app/(member-entry)/onboarding/onboarding-form.tsx');
    expect(onboarding).toContain('const [saving, setSaving] = useState(false);');
    expect(onboarding).toContain('if (saving) return;');
    expect(onboarding).not.toContain('form.formState.isSubmitting');
    expect(onboarding.match(/role="group"/g)).toHaveLength(5);
    expect(onboarding.match(/<FormControl>/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });
});
