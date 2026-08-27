// @vitest-environment node
// @polsia:user-owned — vitest for /api/discover/matches and DiscoverResult.
//
// @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Neutralize server-only (`import 'server-only'` is a side-effect-only
// module, so replacing it with an empty object is enough) and stub Prisma +
// requireAuth so the handler runs against a fake DB.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    profile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    swipe: {
      findMany: vi.fn(),
    },
    block: {
      findMany: vi.fn(),
    },
    privacyPreferences: {
      findMany: vi.fn(),
    },
    discovery: {
      findMany: vi.fn(),
    },
    connection: {
      findMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
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

// --- contract ----------------------------------------------------------------

describe('discover shared contract', () => {
  it('DiscoverMatchItem accepts a valid profile + score in [0,100]', async () => {
    const { DiscoverMatchItem } = await import('@/lib/contracts/discover');
    const NOW = new Date().toISOString();
    const result = DiscoverMatchItem.safeParse({
      profile: {
        id: 'profile-1',
        userId: 'user-1',
        age: 52,
        location: 'Paris',
        interests: ['hiking', 'cooking'],
        lifestylePreferences: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      name: 'Alice',
      score: 87,
      sharedInterests: ['hiking'],
    });
    expect(result.success).toBe(true);
  });

  it('DiscoverMatchItem rejects an out-of-range score', async () => {
    const { DiscoverMatchItem } = await import('@/lib/contracts/discover');
    const NOW = new Date().toISOString();
    const result = DiscoverMatchItem.safeParse({
      profile: {
        id: 'profile-1',
        userId: 'user-1',
        age: 52,
        location: 'Paris',
        interests: ['hiking'],
        lifestylePreferences: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      name: 'Alice',
      score: 150,
      sharedInterests: [],
    });
    expect(result.success).toBe(false);
  });

  it('DiscoverResult accepts a full valid payload', async () => {
    const { DiscoverResult } = await import('@/lib/contracts/discover');
    expect(
      DiscoverResult.safeParse({ matches: [], nextCursor: null, hasProfile: true }).success,
    ).toBe(true);
  });

  it('DiscoverResult rejects a non-nullable nextCursor', async () => {
    const { DiscoverResult } = await import('@/lib/contracts/discover');
    expect(
      DiscoverResult.safeParse({ matches: [], nextCursor: 42, hasProfile: false }).success,
    ).toBe(false);
  });

  it('DiscoverResult accepts an empty matches list and any ignored extras (zod 3 default)', async () => {
    const { DiscoverResult } = await import('@/lib/contracts/discover');
    // zod 3 z.object is passthrough-by-default: extras don't fail. Drift is
    // caught instead by the strict shape of the typed payload below.
    expect(
      DiscoverResult.safeParse({ matches: [], nextCursor: null, hasProfile: false, foo: 'bar' })
        .success,
    ).toBe(true);
  });

  it('DiscoverQuery accepts a missing cursor and a valid cuid', async () => {
    const { DiscoverQuery } = await import('@/lib/contracts/discover');
    expect(DiscoverQuery.safeParse({}).success).toBe(true);
    expect(DiscoverQuery.safeParse({ cursor: `c${'a'.repeat(24)}` }).success).toBe(true);
  });

  it('DiscoverQuery rejects a non-cuid cursor', async () => {
    const { DiscoverQuery } = await import('@/lib/contracts/discover');
    expect(DiscoverQuery.safeParse({ cursor: 'not-a-cuid' }).success).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const VIEWER_USER = 'viewer-user';
const VIEWER_PROFILE = {
  id: `c${'v'.repeat(24)}`,
  userId: VIEWER_USER,
  age: 52,
  location: 'Paris',
  interests: ['hiking', 'cooking', 'jazz'],
  lifestylePreferences: [],
  bio: null,
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function eligibleProfileRow(idSuffix: string, userId: string) {
  return {
    id: `c${idSuffix.padStart(24, '0')}`,
    userId,
    age: 52,
    location: 'Paris',
    interests: ['hiking'],
    lifestylePreferences: [],
    bio: null,
    avatarUrl: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function authed() {
  mocks.requireAuth.mockResolvedValue({ id: VIEWER_USER, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.profile.findUnique.mockReset();
  mocks.prisma.profile.findMany.mockReset();
  mocks.prisma.swipe.findMany.mockReset();
  mocks.prisma.block.findMany.mockReset();
  mocks.prisma.privacyPreferences.findMany.mockReset();
  mocks.prisma.discovery.findMany.mockReset();
  mocks.prisma.connection.findMany.mockReset();
  mocks.prisma.user.findMany.mockReset();
  mocks.requireAuth.mockReset();

  // Safe defaults: no swiped, no blocks, no privacy restrictions, no recently seen, no user names
  mocks.prisma.swipe.findMany.mockResolvedValue([]);
  mocks.prisma.block.findMany.mockResolvedValue([]);
  mocks.prisma.privacyPreferences.findMany.mockResolvedValue([]);
  mocks.prisma.discovery.findMany.mockResolvedValue([]);
  mocks.prisma.connection.findMany.mockResolvedValue([]);
  mocks.prisma.user.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

const getRoute = () => import('@/app/api/discover/matches/route');

describe('discover route — auth + empty branches', () => {
  it('returns 401 when requireAuth rejects', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a malformed cursor', async () => {
    authed();
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches?cursor=not-a-cuid'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.cursor).toBeTruthy();
  });

  it('returns 200 with an empty list when the viewer has no profile', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(null);
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [], nextCursor: null, hasProfile: false });
  });

  it('returns 200 with an empty list when no candidates match', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [], nextCursor: null, hasProfile: true });
    const args = captured.mock.calls[0]?.[0];
    expect(args?.where?.age).toEqual({ gte: 50 });
    expect(args?.where?.reviewStatus).toBe('APPROVED');
    expect(args?.orderBy).toEqual({ id: 'asc' });
    expect(args?.take).toBe(40);
  });
});

describe('discover route — scored ordering', () => {
  // Three candidates keyed by profile id. Two score identically with the
  // viewer (100), one scores lower (0). id ordering is independent of score,
  // so the tie-break rule should be visible in the response.
  function candidateRow(idSuffix: string, age: number, location: string, interests: string[]) {
    return {
      id: `c${idSuffix.padStart(24, '0')}`,
      userId: `user-${idSuffix}`,
      age,
      location,
      interests,
      lifestylePreferences: [],
      bio: null,
      avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  it('orders matches by score DESC with id ASC tie-break', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    // Returned in id ASC order: AAA (high id), BBB (low id = wins tie-break),
    // CCC (zero score — age 82 gives 30yr gap, Lyon, paragliding).
    mocks.prisma.profile.findMany.mockResolvedValue([
      candidateRow('aaa', 52, 'Paris', ['hiking', 'cooking', 'jazz']),
      candidateRow('bbb', 52, 'Paris', ['hiking', 'cooking', 'jazz']),
      candidateRow('ccc', 82, 'Lyon', ['paragliding']),
    ]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toHaveLength(3);
    // Two 100s tie — by id ASC — so 'aaa' precedes 'bbb'. Then 0.
    expect(
      body.matches.map((m: { profile: { userId: string }; score: number }) => ({
        userId: m.profile.userId,
        score: m.score,
      })),
    ).toEqual([
      { userId: 'user-aaa', score: 100 },
      { userId: 'user-bbb', score: 100 },
      { userId: 'user-ccc', score: 0 },
    ]);
    expect(body.nextCursor).toBeNull(); // 3 < PAGE_SIZE
  });

  it('excludes self + swiped + recently-seen candidates', async () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([{ toUserId: 'user-mutual' }]);
    mocks.prisma.discovery.findMany.mockResolvedValue([{ targetUserId: 'user-seen' }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      // After exclusions, only one candidate remains.
      return Promise.resolve([
        {
          id: `c${'x'.repeat(24)}`,
          userId: 'user-keep',
          age: 52,
          location: 'Paris',
          interests: ['hiking'],
          lifestylePreferences: [],
          bio: null,
          avatarUrl: null,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    const exclude = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    // viewer themselves + swiped user + recently-seen target
    expect(exclude).toEqual(expect.arrayContaining([VIEWER_USER, 'user-mutual', 'user-seen']));
    const discoveryWhere = mocks.prisma.discovery.findMany.mock.calls[0]?.[0]?.where;
    expect(discoveryWhere?.viewerUserId).toBe(VIEWER_USER);
    expect(discoveryWhere?.status).toBe('seen');
    expect(discoveryWhere?.seenAt?.gte).toEqual(
      new Date(now.getTime() - 30 * 86_400_000),
    );
  });

  it('excludes an outgoing Connection even when no Swipe exists', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([]);
    mocks.prisma.connection.findMany.mockResolvedValue([{ toUserId: 'user-connected' }]);

    const captured = vi.fn();
    const connected = eligibleProfileRow('connected', 'user-connected');
    const clean = eligibleProfileRow('clean', 'user-clean');
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      const notIn: string[] = args?.where?.userId?.notIn ?? [];
      return Promise.resolve([connected, clean].filter((row) => !notIn.includes(row.userId)));
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.matches.map((m: { profile: { userId: string } }) => m.profile.userId);
    expect(userIds).toEqual(['user-clean']);
    expect(mocks.prisma.swipe.findMany).toHaveBeenCalledWith({
      where: { fromUserId: VIEWER_USER },
      select: { toUserId: true },
    });
    expect(mocks.prisma.connection.findMany).toHaveBeenCalledWith({
      where: { fromUserId: VIEWER_USER },
      select: { toUserId: true },
    });
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain('user-connected');
  });
});

describe('discover route — cursor advance', () => {
  function row(idSuffix: string) {
    return {
      id: `c${idSuffix.padStart(24, '0')}`,
      userId: `user-${idSuffix}`,
      age: 52,
      location: 'Paris',
      interests: ['hiking', 'cooking', 'jazz'],
      lifestylePreferences: [],
      bio: null,
      avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  it('first call returns nextCursor = last id when page is full (PAGE_SIZE = 10)', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);

    const rows = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((s) => row(s));
    mocks.prisma.profile.findMany.mockResolvedValue(rows);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toHaveLength(10);
    expect(body.nextCursor).toBe(rows.at(-1)?.id);
  });

  it('second call with cursor advances; smaller next page returns nextCursor = null', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);

    const cursorId = `c${'10'.padStart(24, '0')}`;
    // Caller passes cursor=...c10... — the handler relays it to findMany.
    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      return Promise.resolve(['11', '12', '13'].map((s) => row(s)));
    });

    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/discover/matches?cursor=${cursorId}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matches).toHaveLength(3);
    expect(body.nextCursor).toBeNull(); // 3 < PAGE_SIZE
    // Cursor is forwarded to the findMany where clause.
    expect(captured.mock.calls[0]?.[0]?.where?.id).toEqual({ gt: cursorId });
  });
});
