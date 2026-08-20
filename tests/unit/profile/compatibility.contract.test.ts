// @vitest-environment node
// @polsia:user-owned — vitest for GET /api/profile/compatibility +
// CompatibilityQuery / CompatibilityResult contracts.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Neutralize `server-only` (it is a side-effect-only module, so an empty
// object replacement is enough) and stub Prisma + requireAuth so the
// handler runs against a fake DB.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('compatibility shared contract', () => {
  it('CompatibilityQuery accepts a valid target id (reuses UserId from swipe)', async () => {
    const { CompatibilityQuery } = await import('@/lib/contracts/compatibility');
    expect(CompatibilityQuery.safeParse({ with: 'a'.repeat(32) }).success).toBe(true);
  });

  it('CompatibilityQuery rejects an empty target id', async () => {
    const { CompatibilityQuery } = await import('@/lib/contracts/compatibility');
    expect(CompatibilityQuery.safeParse({ with: '' }).success).toBe(false);
  });

  it('CompatibilityQuery rejects an oversize target id', async () => {
    const { CompatibilityQuery } = await import('@/lib/contracts/compatibility');
    expect(CompatibilityQuery.safeParse({ with: 'a'.repeat(65) }).success).toBe(false);
  });

  it('CompatibilityQuery rejects a missing `with` key', async () => {
    const { CompatibilityQuery } = await import('@/lib/contracts/compatibility');
    expect(CompatibilityQuery.safeParse({}).success).toBe(false);
  });

  it('CompatibilityResult accepts a fully shaped payload with overall=0.5', async () => {
    const { CompatibilityResult } = await import('@/lib/contracts/compatibility');
    const axes = { score: 0.5, shared: ['a'], divergent: ['b'] };
    const ok = CompatibilityResult.safeParse({
      viewerUserId: 'viewer',
      targetUserId: 'target',
      values: axes,
      interests: axes,
      lifestyle: axes,
      overall: 0.5,
    });
    expect(ok.success).toBe(true);
  });

  it('CompatibilityResult rejects overall > 1', async () => {
    const { CompatibilityResult } = await import('@/lib/contracts/compatibility');
    const axes = { score: 0.5, shared: ['a'], divergent: ['b'] };
    expect(
      CompatibilityResult.safeParse({
        viewerUserId: 'viewer',
        targetUserId: 'target',
        values: axes,
        interests: axes,
        lifestyle: axes,
        overall: 1.5,
      }).success,
    ).toBe(false);
  });

  it('CompatibilityResult rejects a missing axis key', async () => {
    const { CompatibilityResult } = await import('@/lib/contracts/compatibility');
    const axes = { score: 0.5, shared: ['a'], divergent: ['b'] };
    expect(
      CompatibilityResult.safeParse({
        viewerUserId: 'viewer',
        targetUserId: 'target',
        values: axes,
        interests: axes,
        // lifestyle intentionally absent
        overall: 0.5,
      }).success,
    ).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    profile: {
      findUnique: vi.fn(),
    },
  };
  const requireAuth = vi.fn();
  return { prisma, requireAuth };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));

const VIEWER_ID = 'viewer-user-abc';
const TARGET_ID = 'target-user-xyz';

function authed(id = VIEWER_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

function profileRow(args: {
  userId: string;
  age: number;
  location: string;
  interests: string[];
  bio: string | null;
}) {
  return {
    id: `c${args.userId.padEnd(24, '0')}`,
    age: args.age,
    location: args.location,
    interests: args.interests,
    bio: args.bio,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.profile.findUnique.mockReset();
  mocks.requireAuth.mockReset();
});

const getRoute = () => import('@/app/api/profile/compatibility/route');

describe('GET /api/profile/compatibility — auth + input gates', () => {
  it('401 when requireAuth rejects (no Prisma calls)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/profile/compatibility?with=${TARGET_ID}`));
    expect(res.status).toBe(401);
    expect(mocks.prisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it('400 when `with` is missing', async () => {
    authed();
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/profile/compatibility'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.with).toBeTruthy();
    expect(mocks.prisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it('400 when `with` is empty', async () => {
    authed();
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/profile/compatibility?with='));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.with).toBeTruthy();
  });
});

describe('GET /api/profile/compatibility — self / missing target', () => {
  it('403 on self-target (with === session.id) — no Prisma calls', async () => {
    authed(VIEWER_ID);
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/profile/compatibility?with=${VIEWER_ID}`));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.errors?.with).toMatch(/yourself/i);
    expect(mocks.prisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it('404 when target profile is null', async () => {
    authed();
    // Handler does two lookups: viewer first, target second. Target returns
    // null — viewer result is irrelevant (404 short-circuits before scoring).
    mocks.prisma.profile.findUnique
      .mockResolvedValueOnce(
        profileRow({
          userId: VIEWER_ID,
          age: 28,
          location: 'Berlin',
          interests: ['Hiking', 'Cooking'],
          bio: 'love outdoors',
        }),
      )
      .mockResolvedValueOnce(null);
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/profile/compatibility?with=${TARGET_ID}`));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.errors?.with).toBeTruthy();
  });
});

describe('GET /api/profile/compatibility — 200 happy path', () => {
  it('scores shared + divergent interests and emits a zod-shaped payload', async () => {
    authed();
    const viewerRow = profileRow({
      userId: VIEWER_ID,
      age: 28,
      location: 'Berlin',
      interests: ['Hiking', 'Cooking', 'jazz'],
      bio: 'love outdoors',
    });
    const targetRow = profileRow({
      userId: TARGET_ID,
      age: 30,
      location: 'Berlin',
      interests: ['hiking', 'music'],
      bio: 'outdoors enthusiast',
    });
    mocks.prisma.profile.findUnique
      .mockResolvedValueOnce(viewerRow)
      .mockResolvedValueOnce(targetRow);

    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/profile/compatibility?with=${TARGET_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.viewerUserId).toBe(VIEWER_ID);
    expect(body.targetUserId).toBe(TARGET_ID);

    // `Hiking` (viewer) and `hiking` (target) match — case-insensitive normalized.
    expect(body.interests.shared.map((s: string) => s.toLowerCase())).toContain('hiking');
    expect(body.interests.divergent.length).toBeGreaterThan(0);

    // Both bios contain `outdoors` after the stopword filter → values axis is non-empty.
    expect(body.values.shared.length).toBeGreaterThan(0);

    // Same city → lifestyle shared bucket is populated.
    expect(body.lifestyle.shared.length).toBeGreaterThan(0);

    expect(body.overall).toBeGreaterThanOrEqual(0);
    expect(body.overall).toBeLessThanOrEqual(1);

    // Sanity drift-check: only the documented axis keys are present.
    expect(Object.keys(body).sort()).toEqual(
      ['interests', 'lifestyle', 'overall', 'targetUserId', 'values', 'viewerUserId'].sort(),
    );
  });
});
