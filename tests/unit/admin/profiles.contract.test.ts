// @vitest-environment node
// @polsia:user-owned — vitest for GET /api/admin/profiles + AdminProfileList /
// AdminProfileListItem / ReviewStatus contracts.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Neutralize `server-only` (it is a side-effect-only module, so an empty
// object replacement is enough) and stub `auth.api.getSession`, Prisma, and
// `next/headers` so the handler runs against a fake DB + a stub Headers bag
// (the route calls `await headers()`).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// `next/headers#headers()` is awaited in the route handler (better-auth's
// `getSession` consumes it). Stub it with an empty Headers bag — the session
// mock below stands in for the actual auth lookup.
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

const mocks = vi.hoisted(() => {
  const getSession = vi.fn();
  const prisma = {
    profile: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  };
  return { getSession, prisma };
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
  },
}));
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

// --- contract ----------------------------------------------------------------

describe('admin profile review shared contract', () => {
  it('ReviewStatus accepts PENDING / APPROVED / FLAGGED', async () => {
    const { ReviewStatus } = await import('@/lib/contracts/admin');
    expect(ReviewStatus.safeParse('PENDING').success).toBe(true);
    expect(ReviewStatus.safeParse('APPROVED').success).toBe(true);
    expect(ReviewStatus.safeParse('FLAGGED').success).toBe(true);
  });

  it('ReviewStatus rejects a lowercase or unknown status', async () => {
    const { ReviewStatus } = await import('@/lib/contracts/admin');
    expect(ReviewStatus.safeParse('pending').success).toBe(false);
    expect(ReviewStatus.safeParse('UNKNOWN').success).toBe(false);
  });

  it('AdminProfileListItem accepts a fully shaped payload with aliased field names', async () => {
    const { AdminProfileListItem } = await import('@/lib/contracts/admin');
    expect(
      AdminProfileListItem.safeParse({
        id: 'profile-1',
        displayName: 'Alex',
        age: 30,
        city: 'Paris',
        createdAt: '2026-01-01T00:00:00.000Z',
        reviewStatus: 'PENDING',
        avatarUrl: null,
      }).success,
    ).toBe(true);
  });

  it('AdminProfileListItem rejects an invalid reviewStatus', async () => {
    const { AdminProfileListItem } = await import('@/lib/contracts/admin');
    expect(
      AdminProfileListItem.safeParse({
        id: 'profile-1',
        displayName: 'Alex',
        age: 30,
        city: 'Paris',
        createdAt: '2026-01-01T00:00:00.000Z',
        reviewStatus: 'MAYBE',
        avatarUrl: null,
      }).success,
    ).toBe(false);
  });

  it('AdminProfileList accepts an empty list', async () => {
    const { AdminProfileList } = await import('@/lib/contracts/admin');
    expect(AdminProfileList.safeParse({ items: [] }).success).toBe(true);
  });
});

// --- route handler -----------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
});

const getRoute = () => import('@/app/api/admin/profiles/route');

describe('admin profiles route handler', () => {
  it('returns 401 Unauthorized when no session is present', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { GET } = await getRoute();
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 Forbidden when the caller is signed in but not an admin', async () => {
    // Use the string literal `role: 'user'` to avoid pulling Prisma's role
    // enum into the test file's imports — the handler duck-types `!== 'admin'`.
    mocks.getSession.mockResolvedValue({ user: { id: 'viewer-user', role: 'user' } });
    const { GET } = await getRoute();
    const res = await GET();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 200 with an empty list and does not hydrate users when no profiles exist', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });
    mocks.prisma.profile.findMany.mockResolvedValue([]);
    const { GET } = await getRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
    // Empty page → no user hydration call expected (the route short-circuits
    // `prisma.user.findMany` when profiles.length === 0).
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('queries the 50 newest profiles in createdAt DESC order', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });

    // Three rows with descending timestamps to model the ordering contract.
    const T_NEWEST = new Date('2026-03-03T00:00:00.000Z');
    const T_MID = new Date('2026-03-02T00:00:00.000Z');
    const T_OLDEST = new Date('2026-03-01T00:00:00.000Z');
    const rows = [
      {
        id: 'profile-new',
        userId: 'user-new',
        age: 30,
        location: 'Paris',
        createdAt: T_NEWEST,
        reviewStatus: 'PENDING',
        avatarUrl: null,
      },
      {
        id: 'profile-mid',
        userId: 'user-mid',
        age: 28,
        location: 'Lyon',
        createdAt: T_MID,
        reviewStatus: 'PENDING',
        avatarUrl: null,
      },
      {
        id: 'profile-old',
        userId: 'user-old',
        age: 25,
        location: 'Marseille',
        createdAt: T_OLDEST,
        reviewStatus: 'APPROVED',
        avatarUrl: null,
      },
    ];
    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      return Promise.resolve(rows);
    });
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 'user-new', name: 'New' },
      { id: 'user-mid', name: 'Mid' },
      { id: 'user-old', name: 'Old' },
    ]);

    const { GET } = await getRoute();
    const res = await GET();
    expect(res.status).toBe(200);

    // Handler must ask Prisma for the 50 newest via the same shape: 50-row
    // cap + createdAt DESC. The captured arg asserts the query-side contract.
    const findArgs = captured.mock.calls[0]?.[0];
    expect(findArgs?.orderBy).toEqual({ createdAt: 'desc' });
    expect(findArgs?.take).toBe(50);

    // Handler must preserve the DESC order supplied by Prisma on the wire.
    const body = await res.json();
    expect(body.items.map((it: { id: string }) => it.id)).toEqual([
      'profile-new',
      'profile-mid',
      'profile-old',
    ]);
  });

  it('returns the documented aliased shape per row (id, displayName, age, city, createdAt, reviewStatus)', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });
    const CREATED = new Date('2026-02-15T10:00:00.000Z');
    mocks.prisma.profile.findMany.mockResolvedValue([
      {
        id: 'profile-1',
        userId: 'user-1',
        age: 30,
        location: 'Paris',
        createdAt: CREATED,
        reviewStatus: 'PENDING',
        avatarUrl: null,
      },
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'user-1', name: 'Alex' }]);

    const { GET } = await getRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([
      {
        id: 'profile-1',
        displayName: 'Alex',
        age: 30,
        city: 'Paris',
        createdAt: CREATED.toISOString(),
        reviewStatus: 'PENDING',
        avatarUrl: null,
      },
    ]);
  });
});
