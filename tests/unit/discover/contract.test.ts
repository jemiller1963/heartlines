// @polsia:user-owned — vitest for /api/discover/matches and DiscoverResult.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Neutralize server-only (`import 'server-only'` is a side-effect-only
// module, so replacing it with an empty object is enough) and stub Prisma +
// requireAuth so the handler runs against a fake DB.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    profile: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    match: {
      findMany: vi.fn(),
    },
    discovery: {
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
        age: 30,
        location: 'Paris',
        interests: ['hiking', 'cooking'],
        createdAt: NOW,
        updatedAt: NOW,
      },
      score: 87,
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
        age: 30,
        location: 'Paris',
        interests: ['hiking'],
        createdAt: NOW,
        updatedAt: NOW,
      },
      score: 150,
    });
    expect(result.success).toBe(false);
  });

  it('DiscoverResult accepts an empty matches list with null nextCursor', async () => {
    const { DiscoverResult } = await import('@/lib/contracts/discover');
    expect(DiscoverResult.safeParse({ matches: [], nextCursor: null }).success).toBe(true);
  });

  it('DiscoverResult rejects a non-nullable nextCursor', async () => {
    const { DiscoverResult } = await import('@/lib/contracts/discover');
    expect(DiscoverResult.safeParse({ matches: [], nextCursor: 42 }).success).toBe(false);
  });

  it('DiscoverResult accepts an empty matches list and any ignored extras (zod 3 default)', async () => {
    const { DiscoverResult } = await import('@/lib/contracts/discover');
    // zod 3 z.object is passthrough-by-default: extras don't fail. Drift is
    // caught instead by the strict shape of the typed payload below.
    expect(DiscoverResult.safeParse({ matches: [], nextCursor: null, foo: 'bar' }).success).toBe(
      true,
    );
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
  age: 30,
  location: 'Paris',
  interests: ['hiking', 'cooking', 'jazz'],
  bio: null,
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function authed() {
  mocks.requireAuth.mockResolvedValue({ id: VIEWER_USER, email: 'v@x' });
}

function p2021() {
  // The handler duck-types Prisma's error code, so a plain object with `.code`
  // is enough — keeps `@prisma/client` out of the test file's imports.
  return Object.assign(new Error('relation does not exist'), { code: 'P2021' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.profile.findUnique.mockReset();
  mocks.prisma.profile.findMany.mockReset();
  mocks.prisma.match.findMany.mockReset();
  mocks.prisma.discovery.findMany.mockReset();
  mocks.requireAuth.mockReset();
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
    expect(await res.json()).toEqual({ matches: [], nextCursor: null });
  });

  it('returns 200 with an empty list when no candidates match', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.match.findMany.mockResolvedValue([]);
    mocks.prisma.discovery.findMany.mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockResolvedValue([]);
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [], nextCursor: null });
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
      bio: null,
      avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  it('orders matches by score DESC with id ASC tie-break', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.match.findMany.mockResolvedValue([]);
    mocks.prisma.discovery.findMany.mockResolvedValue([]);
    // Returned in id ASC order: AAA (high id), BBB (low id = wins tie-break),
    // CCC (zero score).
    mocks.prisma.profile.findMany.mockResolvedValue([
      candidateRow('aaa', 30, 'Paris', ['hiking', 'cooking', 'jazz']),
      candidateRow('bbb', 30, 'Paris', ['hiking', 'cooking', 'jazz']),
      candidateRow('ccc', 60, 'Lyon', ['paragliding']),
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

  it('excludes self + mutual match partners + recently-seen candidates', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.match.findMany.mockResolvedValue([
      { userAId: VIEWER_USER, userBId: 'user-mutual' },
    ]);
    mocks.prisma.discovery.findMany.mockResolvedValue([{ targetUserId: 'user-seen' }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      // After exclusions, only one candidate remains.
      return Promise.resolve([
        {
          id: `c${'x'.repeat(24)}`,
          userId: 'user-keep',
          age: 30,
          location: 'Paris',
          interests: ['hiking'],
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
    // viewer themselves + mutual partner + recently-seen target
    expect(exclude).toEqual(expect.arrayContaining([VIEWER_USER, 'user-mutual', 'user-seen']));
  });
});

describe('discover route — cursor advance', () => {
  function row(idSuffix: string) {
    return {
      id: `c${idSuffix.padStart(24, '0')}`,
      userId: `user-${idSuffix}`,
      age: 30,
      location: 'Paris',
      interests: ['hiking', 'cooking', 'jazz'],
      bio: null,
      avatarUrl: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
  }

  it('first call returns nextCursor = last id when page is full (PAGE_SIZE = 10)', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.match.findMany.mockResolvedValue([]);
    mocks.prisma.discovery.findMany.mockResolvedValue([]);

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
    mocks.prisma.match.findMany.mockResolvedValue([]);
    mocks.prisma.discovery.findMany.mockResolvedValue([]);

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

describe('discover route — optional Match / Discovery tables', () => {
  it('tolerates Match + Discovery tables being absent (P2021)', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.match.findMany.mockRejectedValue(p2021());
    mocks.prisma.discovery.findMany.mockRejectedValue(p2021());
    mocks.prisma.profile.findMany.mockResolvedValue([]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ matches: [], nextCursor: null });
  });

  it('returns 500 for a non-P2021 error from Match lookup', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.match.findMany.mockRejectedValue(new Error('boom'));
    mocks.prisma.discovery.findMany.mockResolvedValue([]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(500);
  });
});
