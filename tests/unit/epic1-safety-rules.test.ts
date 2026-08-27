// @vitest-environment node
// @polsia:user-owned — Epic 1 safety-rules suite.
//
// Proves all four rules and their combinations:
//   Rule 1: minimum age 50 (profile contract)
//   Rule 2: only APPROVED profiles surface in discovery (reviewStatus)
//   Rule 3: profiles with profilePublic=false are excluded
//   Rule 4: both-direction blocks exclude the relevant user

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    profile: { findUnique: vi.fn(), findMany: vi.fn() },
    swipe: { findMany: vi.fn() },
    block: { findMany: vi.fn() },
    privacyPreferences: { findMany: vi.fn() },
    discovery: { findMany: vi.fn() },
    connection: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  };
  const requireAuth = vi.fn();
  return { prisma, requireAuth };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));

// ─── shared fixtures ──────────────────────────────────────────────────────────

const VIEWER_USER = 'viewer-001';
const SWIPED_USER = 'swiped-001';
const RECENTLY_SEEN_USER = 'recently-seen-001';
const OUTGOING_CONNECTION_USER = 'outgoing-connection-001';
const VIEWER_PROFILE = {
  id: `c${'v'.repeat(24)}`,
  userId: VIEWER_USER,
  age: 55,
  location: 'Lyon',
  interests: ['chess', 'wine', 'hiking'],
  lifestylePreferences: [],
  bio: null,
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function profileRow(
  suffix: string,
  userId: string,
  age = 52,
  location = 'Lyon',
  interests = ['chess'],
  reviewStatus: 'APPROVED' | 'PENDING' | 'FLAGGED' = 'APPROVED',
) {
  return {
    id: `c${suffix.padStart(24, '0')}`,
    userId,
    age,
    location,
    interests,
    lifestylePreferences: [],
    bio: null,
    avatarUrl: null,
    reviewStatus,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function authed(id = VIEWER_USER) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  // Safe defaults
  mocks.prisma.swipe.findMany.mockResolvedValue([]);
  mocks.prisma.block.findMany.mockResolvedValue([]);
  mocks.prisma.privacyPreferences.findMany.mockResolvedValue([]);
  mocks.prisma.discovery.findMany.mockResolvedValue([]);
  mocks.prisma.connection.findMany.mockResolvedValue([]);
  mocks.prisma.user.findMany.mockResolvedValue([]);
  mocks.prisma.profile.findMany.mockResolvedValue([]);
});

// ─── Rule 1: age gate ─────────────────────────────────────────────────────────

describe('ProfileCreate contract — age gate', () => {
  it('rejects age 49 (under minimum)', async () => {
    const { ProfileCreate } = await import('@/lib/contracts/profile');
    const result = ProfileCreate.safeParse({
      age: 49,
      location: 'Paris',
      interests: ['hiking'],
    });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => m.includes('50'))).toBe(true);
  });

  it('accepts age 50 (at minimum)', async () => {
    const { ProfileCreate } = await import('@/lib/contracts/profile');
    const result = ProfileCreate.safeParse({
      age: 50,
      location: 'Paris',
      interests: ['hiking'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts age 120 (at maximum)', async () => {
    const { ProfileCreate } = await import('@/lib/contracts/profile');
    const result = ProfileCreate.safeParse({
      age: 120,
      location: 'Paris',
      interests: ['hiking'],
    });
    expect(result.success).toBe(true);
  });

  it('error message contains "50" for an under-50 age', async () => {
    const { ProfileCreate } = await import('@/lib/contracts/profile');
    const result = ProfileCreate.safeParse({
      age: 18,
      location: 'Paris',
      interests: ['hiking'],
    });
    expect(result.success).toBe(false);
    const msg = result.error?.issues.find((i) => i.path[0] === 'age')?.message ?? '';
    expect(msg).toContain('50');
  });
});

// ─── getCandidateSafetyExcludes unit tests ───────────────────────────────────

describe('getCandidateSafetyExcludes — helper unit tests', () => {
  it('returns an empty set when there are no blocks or privacy rows', async () => {
    const { getCandidateSafetyExcludes } = await import('@/lib/business/candidate-query');
    const result = await getCandidateSafetyExcludes(VIEWER_USER);
    expect(result.size).toBe(0);
  });

  it('includes a candidate that the viewer blocked (outgoing)', async () => {
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([{ blockedId: 'user-blocked-by-viewer' }])
      .mockResolvedValueOnce([]);
    const { getCandidateSafetyExcludes } = await import('@/lib/business/candidate-query');
    const result = await getCandidateSafetyExcludes(VIEWER_USER);
    expect(result.has('user-blocked-by-viewer')).toBe(true);
  });

  it('includes a candidate who blocked the viewer (incoming)', async () => {
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ blockerId: 'user-who-blocked-viewer' }]);
    const { getCandidateSafetyExcludes } = await import('@/lib/business/candidate-query');
    const result = await getCandidateSafetyExcludes(VIEWER_USER);
    expect(result.has('user-who-blocked-viewer')).toBe(true);
  });

  it('includes a user with profilePublic = false', async () => {
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: 'user-private' }]);
    const { getCandidateSafetyExcludes } = await import('@/lib/business/candidate-query');
    const result = await getCandidateSafetyExcludes(VIEWER_USER);
    expect(result.has('user-private')).toBe(true);
  });

  it('combines all three sources into one set', async () => {
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([{ blockedId: 'user-outgoing' }])
      .mockResolvedValueOnce([{ blockerId: 'user-incoming' }]);
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: 'user-private' }]);
    const { getCandidateSafetyExcludes } = await import('@/lib/business/candidate-query');
    const result = await getCandidateSafetyExcludes(VIEWER_USER);
    expect(result.has('user-outgoing')).toBe(true);
    expect(result.has('user-incoming')).toBe(true);
    expect(result.has('user-private')).toBe(true);
    expect(result.size).toBe(3);
  });
});

// ─── Feed route — safety rules integration ───────────────────────────────────

describe('GET /api/feed — reviewStatus: APPROVED filter', () => {
  it('includes reviewStatus: APPROVED in the profile findMany where clause', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);

    const { GET } = await import('@/app/api/feed/route');
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    expect(captured.mock.calls[0]?.[0]?.where?.reviewStatus).toBe('APPROVED');
    expect(captured.mock.calls[0]?.[0]?.where?.age).toEqual({ gte: 50 });
  });
});

describe('GET /api/feed — privacy exclusion', () => {
  it('excludes a candidate whose profilePublic = false', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: 'user-private' }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      return Promise.resolve([]);
    });

    const { GET } = await import('@/app/api/feed/route');
    await GET(new Request('http://test/api/feed'));
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain('user-private');
  });
});

describe('GET /api/feed — outgoing block exclusion', () => {
  it('excludes a candidate that the viewer blocked', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    // First call = outgoing; second = incoming (empty here)
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([{ blockedId: 'user-viewer-blocked' }])
      .mockResolvedValueOnce([]);

    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);

    const { GET } = await import('@/app/api/feed/route');
    await GET(new Request('http://test/api/feed'));
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain('user-viewer-blocked');
  });
});

describe('GET /api/feed — incoming block exclusion (reverse direction)', () => {
  it('excludes a candidate who blocked the viewer', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ blockerId: 'user-who-blocked-viewer' }]);

    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);

    const { GET } = await import('@/app/api/feed/route');
    await GET(new Request('http://test/api/feed'));
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain('user-who-blocked-viewer');
  });
});

describe('GET /api/feed — approved, public, unblocked candidate is included', () => {
  it('returns a clean candidate in the feed items', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.profile.findMany.mockResolvedValue([
      profileRow('good', 'user-clean', 52, 'Lyon', ['chess', 'wine', 'hiking']),
    ]);

    const { GET } = await import('@/app/api/feed/route');
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.items.map((it: { profile: { userId: string } }) => it.profile.userId);
    expect(userIds).toContain('user-clean');
    expect(body.hasProfile).toBe(true);
  });
});

describe('GET /api/feed — all safety rules combined', () => {
  it('surfaces only the clean candidate when others fail various safety checks', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([{ blockedId: 'user-outgoing-blocked' }])
      .mockResolvedValueOnce([{ blockerId: 'user-incoming-blocked' }]);
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: 'user-private' }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      const notIn: string[] = args?.where?.userId?.notIn ?? [];
      const minimumAge: number = args?.where?.age?.gte ?? 0;
      const reviewStatus = args?.where?.reviewStatus;
      const all = [
        profileRow('p0', 'user-under-age', 49),
        profileRow('p1', 'user-outgoing-blocked'),
        profileRow('p2', 'user-incoming-blocked'),
        profileRow('p3', 'user-private'),
        profileRow('p4', 'user-clean', 52, 'Lyon', ['chess', 'wine', 'hiking']),
        profileRow('p5', 'user-boundary-age', 50),
      ];
      return Promise.resolve(
        all.filter(
          (r) =>
            r.age >= minimumAge &&
            r.reviewStatus === reviewStatus &&
            !notIn.includes(r.userId),
        ),
      );
    });

    const { GET } = await import('@/app/api/feed/route');
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.items.map((it: { profile: { userId: string } }) => it.profile.userId);
    expect(userIds).toContain('user-clean');
    expect(userIds).toContain('user-boundary-age');
    expect(userIds).not.toContain('user-under-age');
    expect(userIds).not.toContain('user-outgoing-blocked');
    expect(userIds).not.toContain('user-incoming-blocked');
    expect(userIds).not.toContain('user-private');
    expect(captured.mock.calls[0]?.[0]?.where?.reviewStatus).toBe('APPROVED');
  });
});

// ─── Discover/matches route — safety rules integration ───────────────────────

describe('GET /api/discover/matches — reviewStatus: APPROVED filter', () => {
  it('includes reviewStatus: APPROVED in the profile findMany where clause', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);

    const { GET } = await import('@/app/api/discover/matches/route');
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    expect(captured.mock.calls[0]?.[0]?.where?.reviewStatus).toBe('APPROVED');
    expect(captured.mock.calls[0]?.[0]?.where?.age).toEqual({ gte: 50 });
  });
});

describe('GET /api/discover/matches — privacy exclusion', () => {
  it('excludes a candidate whose profilePublic = false', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: 'user-private' }]);

    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);

    const { GET } = await import('@/app/api/discover/matches/route');
    await GET(new Request('http://test/api/discover/matches'));
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain('user-private');
  });
});

describe('GET /api/discover/matches — outgoing block exclusion', () => {
  it('excludes a candidate that the viewer blocked', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([{ blockedId: 'user-viewer-blocked' }])
      .mockResolvedValueOnce([]);

    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);

    const { GET } = await import('@/app/api/discover/matches/route');
    await GET(new Request('http://test/api/discover/matches'));
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain('user-viewer-blocked');
  });
});

describe('GET /api/discover/matches — incoming block exclusion (reverse direction)', () => {
  it('excludes a candidate who blocked the viewer', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ blockerId: 'user-who-blocked-viewer' }]);

    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);

    const { GET } = await import('@/app/api/discover/matches/route');
    await GET(new Request('http://test/api/discover/matches'));
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain('user-who-blocked-viewer');
  });
});

describe('GET /api/discover/matches — approved, public, unblocked candidate is included', () => {
  it('returns a clean candidate in the matches', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.profile.findMany.mockResolvedValue([
      profileRow('good', 'user-clean', 55, 'Lyon', ['chess', 'wine', 'hiking']),
    ]);

    const { GET } = await import('@/app/api/discover/matches/route');
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.matches.map((m: { profile: { userId: string } }) => m.profile.userId);
    expect(userIds).toContain('user-clean');
    expect(body.hasProfile).toBe(true);
  });
});

describe('GET /api/discover/matches — all safety rules combined', () => {
  it('surfaces only the clean candidate when others fail various safety checks', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([{ blockedId: 'user-outgoing-blocked' }])
      .mockResolvedValueOnce([{ blockerId: 'user-incoming-blocked' }]);
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: 'user-private' }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      const notIn: string[] = args?.where?.userId?.notIn ?? [];
      const minimumAge: number = args?.where?.age?.gte ?? 0;
      const reviewStatus = args?.where?.reviewStatus;
      const all = [
        profileRow('p0', 'user-under-age', 49),
        profileRow('p1', 'user-outgoing-blocked'),
        profileRow('p2', 'user-incoming-blocked'),
        profileRow('p3', 'user-private'),
        profileRow('p4', 'user-clean', 55, 'Lyon', ['chess', 'wine', 'hiking']),
        profileRow('p5', 'user-boundary-age', 50),
      ];
      return Promise.resolve(
        all.filter(
          (r) =>
            r.age >= minimumAge &&
            r.reviewStatus === reviewStatus &&
            !notIn.includes(r.userId),
        ),
      );
    });

    const { GET } = await import('@/app/api/discover/matches/route');
    const res = await GET(new Request('http://test/api/discover/matches'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.matches.map((m: { profile: { userId: string } }) => m.profile.userId);
    expect(userIds).toContain('user-clean');
    expect(userIds).toContain('user-boundary-age');
    expect(userIds).not.toContain('user-under-age');
    expect(userIds).not.toContain('user-outgoing-blocked');
    expect(userIds).not.toContain('user-incoming-blocked');
    expect(userIds).not.toContain('user-private');
    expect(captured.mock.calls[0]?.[0]?.where?.reviewStatus).toBe('APPROVED');
  });
});

describe('GET discovery routes — canonical candidate exclusion parity', () => {
  it('uses the same self, block, privacy, Swipe, recent-seen, and outgoing-connection exclusions', async () => {
    const routeCases = [
      { path: 'feed', resultKey: 'items' },
      { path: 'discover/matches', resultKey: 'matches' },
    ] as const;
    const exclusionSets: string[][] = [];

    for (const routeCase of routeCases) {
      vi.resetAllMocks();
      authed();
      mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
      mocks.prisma.block.findMany
        .mockResolvedValueOnce([{ blockedId: 'outgoing-blocked' }])
        .mockResolvedValueOnce([{ blockerId: 'incoming-blocked' }]);
      mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: 'private-user' }]);
      mocks.prisma.swipe.findMany.mockResolvedValue([{ toUserId: SWIPED_USER }]);
      mocks.prisma.discovery.findMany.mockResolvedValue([
        { targetUserId: RECENTLY_SEEN_USER },
      ]);
      mocks.prisma.connection.findMany.mockResolvedValue([
        { toUserId: OUTGOING_CONNECTION_USER },
      ]);
      mocks.prisma.user.findMany.mockResolvedValue([]);

      const captured = vi.fn();
      mocks.prisma.profile.findMany.mockImplementation((args) => {
        captured(args);
        const where = args?.where ?? {};
        const notIn: string[] = where.userId?.notIn ?? [];
        const all = [
          profileRow('under', 'under-age', 49),
          profileRow('pending', 'pending-user', 52, 'Lyon', ['chess'], 'PENDING'),
          profileRow('flagged', 'flagged-user', 52, 'Lyon', ['chess'], 'FLAGGED'),
          profileRow('self', VIEWER_USER),
          profileRow('outgoing-block', 'outgoing-blocked'),
          profileRow('incoming-block', 'incoming-blocked'),
          profileRow('private', 'private-user'),
          profileRow('swiped', SWIPED_USER),
          profileRow('recent', RECENTLY_SEEN_USER),
          profileRow('connection', OUTGOING_CONNECTION_USER),
          profileRow('clean', 'clean-user'),
        ];
        return Promise.resolve(
          all.filter(
            (row) =>
              row.age >= (where.age?.gte ?? Number.NEGATIVE_INFINITY) &&
              row.reviewStatus === where.reviewStatus &&
              !notIn.includes(row.userId),
          ),
        );
      });

      const GET =
        routeCase.path === 'feed'
          ? (await import('@/app/api/feed/route')).GET
          : (await import('@/app/api/discover/matches/route')).GET;
      const res = await GET(new Request(`http://test/api/${routeCase.path}`));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body[routeCase.resultKey]).toHaveLength(1);
      expect(body[routeCase.resultKey][0]?.profile?.userId).toBe('clean-user');
      exclusionSets.push(captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? []);
    }

    const expected = [
      VIEWER_USER,
      'outgoing-blocked',
      'incoming-blocked',
      'private-user',
      SWIPED_USER,
      RECENTLY_SEEN_USER,
      OUTGOING_CONNECTION_USER,
    ];
    expect(exclusionSets).toHaveLength(2);
    expect(exclusionSets[0]).toEqual(expect.arrayContaining(expected));
    expect(exclusionSets[1]).toEqual(expect.arrayContaining(expected));
    const [feedExclusions = [], matchesExclusions = []] = exclusionSets;
    expect(new Set(feedExclusions)).toEqual(new Set(matchesExclusions));
  });
});
