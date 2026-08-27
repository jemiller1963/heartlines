// @vitest-environment node
// @polsia:user-owned — vitest for /api/feed, focused on the block-exclusion
// wiring (POST /api/blocks recorded → GET /api/feed omits the blocked target
// while keeping C and existing swipe/seen exclusions).
//
// `// @vitest-environment node` is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Neutralize server-only and stub Prisma + requireAuth so the handlers run
// against a fake DB.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    profile: { findUnique: vi.fn(), findMany: vi.fn() },
    swipe: { findMany: vi.fn() },
    block: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    privacyPreferences: { findMany: vi.fn() },
    discovery: { findMany: vi.fn() },
    connection: { findMany: vi.fn() },
  };
  const requireAuth = vi.fn();
  return { prisma, requireAuth };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));

// --- shared fixtures ---------------------------------------------------------

const VIEWER_USER = 'user-A';
const BLOCKED_USER = 'user-B';
const KEEP_USER = 'user-C';
const SWIPED_USER = 'user-D';
const ALSO_KEEP_USER = 'user-E';
const RECENTLY_SEEN_USER = 'user-F';
const OLD_SEEN_USER = 'user-G';
const OUTGOING_CONNECTION_USER = 'user-H';
const INCOMING_CONNECTION_USER = 'user-I';

const VIEWER_PROFILE = {
  id: `c${'a'.repeat(24)}`,
  userId: VIEWER_USER,
  age: 30,
  location: 'Paris',
  interests: ['hiking', 'cooking', 'jazz'],
  bio: null,
  avatarUrl: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

function candidateRow(
  idSuffix: string,
  userId: string,
  age: number,
  location: string,
  interests: string[],
) {
  return {
    id: `c${idSuffix.padStart(24, '0')}`,
    userId,
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

function authed(id = VIEWER_USER) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

function blockRow(args: { id: string; blockerId: string; blockedId: string; createdAt: Date }) {
  return {
    id: args.id,
    blockerId: args.blockerId,
    blockedId: args.blockedId,
    createdAt: args.createdAt,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.profile.findUnique.mockReset();
  mocks.prisma.profile.findMany.mockReset();
  mocks.prisma.swipe.findMany.mockReset();
  mocks.prisma.block.findUnique.mockReset();
  mocks.prisma.block.findMany.mockReset();
  mocks.prisma.block.create.mockReset();
  mocks.prisma.privacyPreferences.findMany.mockReset();
  mocks.prisma.discovery.findMany.mockReset();
  mocks.prisma.connection.findMany.mockReset();
  mocks.requireAuth.mockReset();

  // Safe defaults: no restrictions or prior discovery actions
  mocks.prisma.swipe.findMany.mockResolvedValue([]);
  mocks.prisma.block.findMany.mockResolvedValue([]);
  mocks.prisma.privacyPreferences.findMany.mockResolvedValue([]);
  mocks.prisma.discovery.findMany.mockResolvedValue([]);
  mocks.prisma.connection.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

const postRoute = () => import('@/app/api/blocks/route');
const getRoute = () => import('@/app/api/feed/route');

// --- POST /api/blocks — seeds the shared block store ------------------------

describe('POST /api/blocks — wires A→B into the shared block store', () => {
  it('returns 200 with the recorded blockedId and creates a row keyed to the session', async () => {
    authed('user-A');
    mocks.prisma.block.findUnique.mockResolvedValue(null);
    const BLOCK_ID = `c${'b'.repeat(24)}`;
    mocks.prisma.block.create.mockResolvedValue(
      blockRow({
        id: BLOCK_ID,
        blockerId: 'user-A',
        blockedId: BLOCKED_USER,
        createdAt: new Date('2026-07-31T00:00:00.000Z'),
      }),
    );

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ toUserId: BLOCKED_USER }),
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.blockedId).toBe(BLOCKED_USER);
    expect('idempotent' in body).toBe(false);

    // blockerId is sourced from session, NEVER from the body.
    const createArgs = mocks.prisma.block.create.mock.calls[0]?.[0];
    expect(createArgs?.data?.blockerId).toBe('user-A');
    expect(createArgs?.data?.blockedId).toBe(BLOCKED_USER);
  });
});

// --- GET /api/feed — headline: block exclusion ------------------------------

describe('GET /api/feed — excludes B (blocked) but keeps C', () => {
  it('omits the blocked target from items[*].profile.userId while keeping a third profile', async () => {
    authed('user-A');
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([]);
    mocks.prisma.block.findMany.mockResolvedValue([{ blockedId: BLOCKED_USER }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      const notIn: string[] = args?.where?.userId?.notIn ?? [];
      const all = [
        candidateRow('bbb', BLOCKED_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
        candidateRow('ccc', KEEP_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
      ];
      return Promise.resolve(all.filter((r) => !notIn.includes(r.userId)));
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.items.map((it: { profile: { userId: string } }) => it.profile.userId);
    expect(userIds).not.toContain(BLOCKED_USER);
    expect(userIds).toContain(KEEP_USER);

    // The notIn set on the findMany call must include both the viewer and B.
    const notIn = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toEqual(expect.arrayContaining([VIEWER_USER, BLOCKED_USER]));
    expect(body.hasProfile).toBe(true);
  });
});

// --- GET /api/feed — block + swipe coexistence ------------------------------

describe('GET /api/feed — block exclusion sits alongside swipe/seen exclusion', () => {
  it('keeps E while omitting D (swiped) and B (blocked)', async () => {
    authed('user-A');
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([{ toUserId: SWIPED_USER }]);
    mocks.prisma.block.findMany.mockResolvedValue([{ blockedId: BLOCKED_USER }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      const notIn: string[] = args?.where?.userId?.notIn ?? [];
      const all = [
        candidateRow('bbb', BLOCKED_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
        candidateRow('ddd', SWIPED_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
        candidateRow('eee', ALSO_KEEP_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
      ];
      return Promise.resolve(all.filter((r) => !notIn.includes(r.userId)));
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.items.map((it: { profile: { userId: string } }) => it.profile.userId);
    expect(userIds).not.toContain(SWIPED_USER);
    expect(userIds).not.toContain(BLOCKED_USER);
    expect(userIds).toContain(ALSO_KEEP_USER);

    const notIn = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toEqual(expect.arrayContaining([VIEWER_USER, SWIPED_USER, BLOCKED_USER]));
  });
});

describe('GET /api/feed — canonical recent-seen and outgoing-connection exclusions', () => {
  it('omits recent seen and outgoing Connection targets while keeping old-seen and incoming-connection candidates', async () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    authed('user-A');
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([]);
    mocks.prisma.block.findMany.mockResolvedValue([]);
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([]);

    const recentSeenAt = new Date('2026-08-20T12:00:00.000Z');
    const oldSeenAt = new Date('2026-07-20T12:00:00.000Z');
    const seenRows = [
      { targetUserId: RECENTLY_SEEN_USER, status: 'seen', seenAt: recentSeenAt },
      { targetUserId: OLD_SEEN_USER, status: 'seen', seenAt: oldSeenAt },
      { targetUserId: INCOMING_CONNECTION_USER, status: 'connected', seenAt: recentSeenAt },
    ];
    mocks.prisma.discovery.findMany.mockImplementation((args) => {
      const where = args?.where;
      const cutoff = where?.seenAt?.gte;
      return Promise.resolve(
        seenRows
          .filter(
            (row) => row.status === where?.status && (!cutoff || row.seenAt >= cutoff),
          )
          .map(({ targetUserId }) => ({ targetUserId })),
      );
    });
    mocks.prisma.connection.findMany.mockResolvedValue([
      { toUserId: OUTGOING_CONNECTION_USER },
    ]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      const notIn: string[] = args?.where?.userId?.notIn ?? [];
      const all = [
        candidateRow('recent', RECENTLY_SEEN_USER, 52, 'Paris', ['hiking']),
        candidateRow('old', OLD_SEEN_USER, 52, 'Paris', ['hiking']),
        candidateRow('outgoing', OUTGOING_CONNECTION_USER, 52, 'Paris', ['hiking']),
        candidateRow('incoming', INCOMING_CONNECTION_USER, 52, 'Paris', ['hiking']),
        candidateRow('clean', KEEP_USER, 52, 'Paris', ['hiking']),
      ];
      return Promise.resolve(all.filter((row) => !notIn.includes(row.userId)));
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.items.map((it: { profile: { userId: string } }) => it.profile.userId);
    expect(userIds).not.toContain(RECENTLY_SEEN_USER);
    expect(userIds).not.toContain(OUTGOING_CONNECTION_USER);
    expect(userIds).toEqual(
      expect.arrayContaining([OLD_SEEN_USER, INCOMING_CONNECTION_USER, KEEP_USER]),
    );

    const discoveryWhere = mocks.prisma.discovery.findMany.mock.calls[0]?.[0]?.where;
    expect(discoveryWhere?.viewerUserId).toBe(VIEWER_USER);
    expect(discoveryWhere?.status).toBe('seen');
    expect(discoveryWhere?.seenAt?.gte).toEqual(
      new Date(now.getTime() - 30 * 86_400_000),
    );
    expect(mocks.prisma.connection.findMany).toHaveBeenCalledWith({
      where: { fromUserId: VIEWER_USER },
      select: { toUserId: true },
    });
    expect(mocks.prisma.swipe.findMany).toHaveBeenCalledWith({
      where: { fromUserId: VIEWER_USER },
      select: { toUserId: true },
    });
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain(OUTGOING_CONNECTION_USER);
    expect(notIn).not.toContain(INCOMING_CONNECTION_USER);
  });
});

// --- GET /api/feed — empty blocks + empty swipes -----------------------------

describe('GET /api/feed — empty blocks + empty swipes', () => {
  it('keeps C, hasProfile: true, nextCursor: null (sanity / no-regression)', async () => {
    authed('user-A');
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([]);
    mocks.prisma.block.findMany.mockResolvedValue([]);

    mocks.prisma.profile.findMany.mockResolvedValue([
      candidateRow('ccc', KEEP_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
    ]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasProfile).toBe(true);
    const userIds = body.items.map((it: { profile: { userId: string } }) => it.profile.userId);
    expect(userIds).toContain(KEEP_USER);
    // 1 row < PAGE_SIZE (10) → nextCursor is null on the empty-page tail.
    expect(body.nextCursor).toBeNull();
  });
});

// --- GET /api/feed — reverse block (candidate blocked viewer) ----------------

describe('GET /api/feed — excludes candidate who blocked the viewer', () => {
  it('omits a candidate who blocked the viewer (incoming block direction)', async () => {
    authed('user-A');
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([]);
    // First call (outgoing): no blocks by viewer. Second call (incoming): BLOCKED_USER blocked viewer.
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ blockerId: BLOCKED_USER }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      const notIn: string[] = args?.where?.userId?.notIn ?? [];
      const all = [
        candidateRow('bbb', BLOCKED_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
        candidateRow('ccc', KEEP_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
      ];
      return Promise.resolve(all.filter((r) => !notIn.includes(r.userId)));
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.items.map((it: { profile: { userId: string } }) => it.profile.userId);
    expect(userIds).not.toContain(BLOCKED_USER);
    expect(userIds).toContain(KEEP_USER);

    const notIn = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toEqual(expect.arrayContaining([BLOCKED_USER]));
  });
});

// --- GET /api/feed — privacy exclusion ---------------------------------------

describe('GET /api/feed — excludes candidate with profilePublic = false', () => {
  it('omits a candidate who disabled discovery visibility', async () => {
    authed('user-A');
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([]);
    mocks.prisma.block.findMany.mockResolvedValue([]);
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: BLOCKED_USER }]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      const notIn: string[] = args?.where?.userId?.notIn ?? [];
      const all = [
        candidateRow('bbb', BLOCKED_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
        candidateRow('ccc', KEEP_USER, 52, 'Paris', ['hiking', 'cooking', 'jazz']),
      ];
      return Promise.resolve(all.filter((r) => !notIn.includes(r.userId)));
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const body = await res.json();
    const userIds = body.items.map((it: { profile: { userId: string } }) => it.profile.userId);
    expect(userIds).not.toContain(BLOCKED_USER);
    expect(userIds).toContain(KEEP_USER);

    const notIn = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toEqual(expect.arrayContaining([BLOCKED_USER]));
  });
});

// --- GET /api/feed — reviewStatus filter ------------------------------------

describe('GET /api/feed — only APPROVED candidates are queried', () => {
  it('passes reviewStatus: APPROVED in the profile findMany where clause', async () => {
    authed('user-A');
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([]);
    mocks.prisma.block.findMany.mockResolvedValue([]);

    const captured = vi.fn();
    mocks.prisma.profile.findMany.mockImplementation((args) => {
      captured(args);
      return Promise.resolve([]);
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/feed'));
    expect(res.status).toBe(200);
    const where = captured.mock.calls[0]?.[0]?.where;
    expect(where?.reviewStatus).toBe('APPROVED');
    expect(where?.age).toEqual({ gte: 50 });
    expect(captured.mock.calls[0]?.[0]?.orderBy).toEqual({ id: 'asc' });
    expect(captured.mock.calls[0]?.[0]?.take).toBe(40);
  });
});
