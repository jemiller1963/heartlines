// @vitest-environment node
// @polsia:user-owned — focused Epic 3 shell and routing regression coverage.

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  authOrResponse: vi.fn(),
  prisma: { profile: { findUnique: vi.fn() } },
}));
vi.mock('@/lib/require-auth-result', () => ({
  authOrResponse: mocks.authOrResponse,
}));
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

const root = process.cwd();
const source = (file: string) => readFileSync(path.join(root, file), 'utf8');

describe('Epic 3 structural shells', () => {
  it('owns public chrome in the public layout and member chrome in member layouts', () => {
    const publicLayout = source('src/app/(public)/layout.tsx');
    expect(publicLayout).toContain('<SiteNav enabled />');
    expect(publicLayout).toContain('<SiteFooter enabled />');
    expect(source('src/app/(dashboard)/layout.tsx')).toContain('<DashboardShell>');
    expect(source('src/app/(member-entry)/layout.tsx')).toContain(
      'DashboardShell variant="minimal"',
    );
    const siteNav = source('src/components/custom/site-nav.tsx');
    expect(siteNav).not.toContain('isMemberRoute');
    expect(siteNav).not.toContain('member-routes');
    expect(existsSync(path.join(root, 'src/lib/member-routes.ts'))).toBe(false);
  });

  it('keeps exact member primary order and required secondary destinations', () => {
    const nav = source('src/components/custom/dashboard/dashboard-nav.tsx');
    let previous = -1;
    for (const [href, label] of [
      ['/feed', 'Matches'],
      ['/messages', 'Messages'],
      ['/events', 'Events'],
      ['/profile', 'Profile'],
    ] as const) {
      const position = nav.indexOf(`href: '${href}', label: '${label}'`);
      expect(position).toBeGreaterThan(previous);
      previous = position;
    }
    for (const [href, label] of [
      ['/settings/privacy', 'Privacy'],
      ['/settings/blocks', 'Blocked members'],
      ['/pricing', 'Subscription / Pricing'],
      ['/settings/account', 'Account'],
      ['/support', 'Safety & Support'],
    ] as const) {
      expect(nav).toContain(`href: '${href}'`);
      expect(nav).toContain(`label: '${label}'`);
    }
    expect(source('src/components/custom/dashboard/dashboard-shell.tsx')).toContain('Sign out');
    expect(nav).toContain("label: 'Video Dates'");
    expect(nav).toContain("label: 'Edit profile'");
    expect(nav).not.toContain("label: 'Overview'");
    expect(nav).not.toContain("label: 'Dashboard'");
  });

  it('keeps dashboard compatibility starter-free, auth entry centralized, and admin independent', () => {
    const dashboard = source('src/app/(dashboard)/dashboard/page.tsx');
    expect(dashboard).toContain("apiFetch('/api/member-entry'");
    expect(dashboard).not.toMatch(/Overview|Customer dashboard|Admin dashboard|Starter/);
    expect(source('src/components/custom/sign-in-form.tsx')).toContain(
      "apiFetch('/api/member-entry'",
    );
    expect(source('src/app/(member-entry)/onboarding/onboarding-form.tsx')).toContain(
      "apiFetch('/api/member-entry'",
    );
    expect(source('src/app/(dashboard)/admin/profiles/page.tsx')).toContain('requireAdmin');
    expect(source('src/app/(dashboard)/admin/profiles/page.tsx')).not.toContain('member-entry');
    expect(source('src/components/custom/dashboard/dashboard-shell.tsx')).toContain(
      "router.replace('/login')",
    );
  });

  it('keeps member deep links and removes the nonexistent event edit link', () => {
    for (const file of [
      'feed/page.tsx',
      'messages/page.tsx',
      'messages/[threadId]/page.tsx',
      'events/page.tsx',
      'events/new/page.tsx',
      'events/[id]/page.tsx',
      'profile/page.tsx',
      'profile/[id]/page.tsx',
      'profile/edit/page.tsx',
      'settings/privacy/page.tsx',
      'settings/blocks/page.tsx',
      'video-sessions/page.tsx',
    ]) {
      expect(existsSync(path.join(root, 'src/app/(dashboard)', file))).toBe(true);
    }
    expect(source('src/components/custom/events/event-detail.tsx')).not.toContain('/edit');
  });
});

describe('centralized member entry', () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    [undefined, '/onboarding'],
    [null, '/onboarding'],
    ['PENDING', '/review-status'],
    ['FLAGGED', '/review-status'],
    ['APPROVED', '/feed'],
  ] as const)('maps %s to %s', async (status, destination) => {
    const { memberEntryDestination } = await import('@/lib/member-entry');
    expect(memberEntryDestination(status)).toBe(destination);
  });

  it('uses only Profile.reviewStatus in the member-entry API', async () => {
    mocks.authOrResponse.mockResolvedValue({
      ok: true,
      session: { id: 'member-1' },
    });
    mocks.prisma.profile.findUnique.mockResolvedValue({
      reviewStatus: 'APPROVED',
    });
    const { GET } = await import('@/app/api/member-entry/route');
    const response = await GET(new Request('http://localhost/api/member-entry'));
    expect(await response.json()).toEqual({ destination: '/feed' });
    expect(mocks.prisma.profile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'member-1' },
      select: { reviewStatus: true },
    });
  });
});
