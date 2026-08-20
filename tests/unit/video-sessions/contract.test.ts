// @polsia:user-owned — vitest for POST /api/video-sessions + the
// VideoSessionCreate / VideoSessionResult contracts.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
//
// Mirrors `messages/send.contract.test.ts` in shape — `vi.mock('server-only',
// () => ({}))` neutralizes the side-effect-only import, the hoisted mock
// block stubs `@/lib/db`, `@/lib/require-auth`, and
// `@/lib/business/subscription`, and each test reimports the route handler
// so the mocks take effect.
//
// The subscription mock is shared with `video-sessions-gate.test.ts` — it
// opts into active state by default (this suite asserts non-paywall gates)
// and tests can flip `subscriptionActive` to false to exercise the 402
// path separately.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('video-sessions contract', () => {
  it('VideoSessionCreate accepts a valid toUserId and rejects a missing/empty one', async () => {
    const { VideoSessionCreate } = await import('@/lib/contracts/video-sessions');
    expect(VideoSessionCreate.safeParse({ toUserId: 'user-a' }).success).toBe(true);
    expect(VideoSessionCreate.safeParse({ toUserId: '' }).success).toBe(false);
    expect(VideoSessionCreate.safeParse({}).success).toBe(false);
    // The contract intentionally does NOT enforce a self-target guard — the
    // server is the source of truth.
    expect(VideoSessionCreate.safeParse({ toUserId: 'me' }).success).toBe(true);
  });

  it('VideoSessionCreate rejects an over-long toUserId (>64 chars)', async () => {
    const { VideoSessionCreate } = await import('@/lib/contracts/video-sessions');
    expect(VideoSessionCreate.safeParse({ toUserId: 'a'.repeat(65) }).success).toBe(false);
  });

  it('VideoSessionResult accepts a well-formed row and rejects a non-cuid id', async () => {
    const { VideoSessionResult } = await import('@/lib/contracts/video-sessions');
    const NOW = '2026-03-05T00:00:00.000Z';
    expect(
      VideoSessionResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'PENDING',
        roomUrl: 'room-token',
        startAt: null,
        endAt: null,
        createdAt: NOW,
      }).success,
    ).toBe(true);
    expect(
      VideoSessionResult.safeParse({
        id: 'not-a-cuid',
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'PENDING',
        roomUrl: 'room-token',
        startAt: null,
        endAt: null,
        createdAt: NOW,
      }).success,
    ).toBe(false);
  });

  it('VideoSessionResult rejects an out-of-enum status (e.g. PONG)', async () => {
    const { VideoSessionResult } = await import('@/lib/contracts/video-sessions');
    expect(
      VideoSessionResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'PONG',
        roomUrl: 'room-token',
        startAt: null,
        endAt: null,
        createdAt: '2026-03-05T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('VideoSessionResult requires a non-empty roomUrl', async () => {
    const { VideoSessionResult } = await import('@/lib/contracts/video-sessions');
    expect(
      VideoSessionResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        userAId: 'user-a',
        userBId: 'user-b',
        status: 'PENDING',
        roomUrl: '',
        startAt: null,
        endAt: null,
        createdAt: '2026-03-05T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    swipe: { findFirst: vi.fn() },
    connection: { findFirst: vi.fn() },
    videoSession: { create: vi.fn(), findMany: vi.fn() },
  };
  const requireAuth = vi.fn();
  const subscriptionActive = { value: true };
  return { prisma, requireAuth, subscriptionActive };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));
vi.mock('@/lib/business/subscription', () => ({
  requireSubscription: async () => {
    if (!mocks.subscriptionActive.value) {
      throw Response.json(
        {
          error: 'subscription_required',
          message:
            'A Heart Lines Premium subscription is required to send messages or join a video date.',
        },
        { status: 402 },
      );
    }
    return { active: true, currentPeriodEnd: null, plan: 'premium-monthly' };
  },
  getSubscriptionForUser: async () => ({
    active: mocks.subscriptionActive.value,
    currentPeriodEnd: null,
    plan: mocks.subscriptionActive.value ? 'premium-monthly' : null,
  }),
}));

const SESSION_ID = 'viewer-user';
const OTHER_ID = 'other-user';
const SESSION_ID_CUID = `c${'x'.repeat(24)}`;
// 'o' (111) sorts before 'v' (118) — other-user is the canonical A side.
const SORTED_A = OTHER_ID;
const SORTED_B = SESSION_ID;

function sessionRow(args: {
  id: string;
  userAId: string;
  userBId: string;
  status: 'PENDING' | 'ACTIVE' | 'ENDED';
  roomUrl: string;
  startAt: Date | null;
  endAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: args.id,
    userAId: args.userAId,
    userBId: args.userBId,
    status: args.status,
    roomUrl: args.roomUrl,
    startAt: args.startAt,
    endAt: args.endAt,
    createdAt: args.createdAt,
  };
}

function authed(id = SESSION_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.subscriptionActive.value = true;
  mocks.prisma.swipe.findFirst.mockReset();
  mocks.prisma.connection.findFirst.mockReset();
  mocks.prisma.videoSession.create.mockReset();
  mocks.prisma.videoSession.findMany.mockReset();
  mocks.requireAuth.mockReset();
});

const postRoute = () => import('@/app/api/video-sessions/route');
const getRoute = () => import('@/app/api/video-sessions/route');

describe('POST /api/video-sessions — auth + access gates', () => {
  it('401 when requireAuth rejects (no Prisma calls, no creates)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/video-sessions', { method: 'POST', body: '{}' }),
    );
    expect(res.status).toBe(401);
    expect(mocks.prisma.swipe.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.connection.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.videoSession.create).not.toHaveBeenCalled();
  });

  it('400 when toUserId is missing', async () => {
    authed();
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/video-sessions', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.toUserId).toBeDefined();
    expect(mocks.prisma.swipe.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.connection.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.videoSession.create).not.toHaveBeenCalled();
  });

  it('400 when toUserId === session.id (self-target)', async () => {
    authed();
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/video-sessions', {
        method: 'POST',
        body: JSON.stringify({ toUserId: SESSION_ID }),
      }),
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors.toUserId).toBe('You cannot start a video date with yourself.');
    expect(mocks.prisma.swipe.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.connection.findFirst).not.toHaveBeenCalled();
    expect(mocks.prisma.videoSession.create).not.toHaveBeenCalled();
  });

  it('403 when neither seam reports a match', async () => {
    authed();
    mocks.prisma.swipe.findFirst.mockResolvedValue(null);
    mocks.prisma.connection.findFirst.mockResolvedValue(null);
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/video-sessions', {
        method: 'POST',
        body: JSON.stringify({ toUserId: OTHER_ID }),
      }),
    );
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.errors.toUserId).toBe('You can only start a video date with a match.');
    expect(mocks.prisma.videoSession.create).not.toHaveBeenCalled();
  });

  it('403 when only one side has ACCEPT swiped (no Connection)', async () => {
    authed();
    mocks.prisma.swipe.findFirst.mockImplementation(
      ({ where }: { where: { fromUserId: string; toUserId: string } }) => {
        if (where.fromUserId === SESSION_ID && where.toUserId === OTHER_ID) {
          return Promise.resolve({ id: 'ab' });
        }
        return Promise.resolve(null);
      },
    );
    mocks.prisma.connection.findFirst.mockResolvedValue(null);
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/video-sessions', {
        method: 'POST',
        body: JSON.stringify({ toUserId: OTHER_ID }),
      }),
    );
    expect(res.status).toBe(403);
    expect(mocks.prisma.videoSession.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/video-sessions — happy path', () => {
  it('200 with sorted canonical pair, server-generated roomUrl, PENDING status', async () => {
    authed();
    mocks.prisma.swipe.findFirst.mockResolvedValue({ id: 'ab-or-ba' });
    mocks.prisma.connection.findFirst.mockResolvedValue(null);

    const NOW = new Date('2026-03-05T00:00:00.000Z');
    mocks.prisma.videoSession.create.mockResolvedValue(
      sessionRow({
        id: SESSION_ID_CUID,
        userAId: SORTED_A,
        userBId: SORTED_B,
        status: 'PENDING',
        roomUrl: 'server-generated-room-token',
        startAt: null,
        endAt: null,
        createdAt: NOW,
      }),
    );

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/video-sessions', {
        method: 'POST',
        body: JSON.stringify({ toUserId: OTHER_ID }),
      }),
    );
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.id).toBe(SESSION_ID_CUID);
    expect(json.userAId).toBe(SORTED_A);
    expect(json.userBId).toBe(SORTED_B);
    expect(json.status).toBe('PENDING');
    expect(json.startAt).toBeNull();
    expect(json.endAt).toBeNull();
    expect(json.createdAt).toBe(NOW.toISOString());
    expect(typeof json.roomUrl).toBe('string');
    expect(json.roomUrl.length).toBeGreaterThan(0);

    // Canonical-pair invariant: create data.userAId/create data.userBId are
    // [session.id, other.id].sort() regardless of which side the viewer is on.
    expect(mocks.prisma.videoSession.create).toHaveBeenCalledTimes(1);
    const createArgs = mocks.prisma.videoSession.create.mock.calls[0]?.[0] as {
      data: { userAId: string; userBId: string; roomUrl: string };
    };
    expect(createArgs.data.userAId).toBe(SORTED_A);
    expect(createArgs.data.userBId).toBe(SORTED_B);
    expect(typeof createArgs.data.roomUrl).toBe('string');
    expect(createArgs.data.roomUrl.length).toBeGreaterThan(0);
    expect(createArgs.data.roomUrl).not.toBe(OTHER_ID);

    // Match probe ran on BOTH swipes + BOTH connection directions (4 reads).
    expect(mocks.prisma.swipe.findFirst).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.connection.findFirst).toHaveBeenCalledTimes(2);
  });

  it('200 when only the Connection seam reports a match (no ACCEPT swipes)', async () => {
    authed();
    mocks.prisma.swipe.findFirst.mockResolvedValue(null);
    mocks.prisma.connection.findFirst.mockImplementation(
      ({ where }: { where: { fromUserId: string; toUserId: string } }) => {
        if (where.fromUserId === SESSION_ID && where.toUserId === OTHER_ID) {
          return Promise.resolve({ id: 'ab-conn' });
        }
        return Promise.resolve(null);
      },
    );

    const NOW = new Date('2026-03-05T00:00:00.000Z');
    mocks.prisma.videoSession.create.mockResolvedValue(
      sessionRow({
        id: `c${'y'.repeat(24)}`,
        userAId: SORTED_A,
        userBId: SORTED_B,
        status: 'PENDING',
        roomUrl: 'token',
        startAt: null,
        endAt: null,
        createdAt: NOW,
      }),
    );

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/video-sessions', {
        method: 'POST',
        body: JSON.stringify({ toUserId: OTHER_ID }),
      }),
    );
    expect(res.status).toBe(200);
    expect(mocks.prisma.videoSession.create).toHaveBeenCalledTimes(1);
  });
});

describe('GET /api/video-sessions — auth + access gates', () => {
  it('401 when requireAuth rejects (no findMany call)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/video-sessions'));
    expect(res.status).toBe(401);
    expect(mocks.prisma.videoSession.findMany).not.toHaveBeenCalled();
  });

  it('400 when ?status= is invalid', async () => {
    authed();
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/video-sessions?status=BOGUS'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors.status).toBe('Invalid status');
    expect(mocks.prisma.videoSession.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/video-sessions — happy path', () => {
  it('200 with empty list when findMany returns [] (authed caller, default PENDING)', async () => {
    authed();
    mocks.prisma.videoSession.findMany.mockResolvedValue([]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/video-sessions'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ items: [] });

    expect(mocks.prisma.videoSession.findMany).toHaveBeenCalledTimes(1);
    const args = mocks.prisma.videoSession.findMany.mock.calls[0]?.[0] as {
      where: {
        OR: Array<{ userAId: string } | { userBId: string }>;
        status: string;
      };
      orderBy: { createdAt: 'desc' };
    };
    expect(args.where.status).toBe('PENDING');
    expect(args.where.OR).toEqual([{ userAId: SESSION_ID }, { userBId: SESSION_ID }]);
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('200 with rows from both sides, ordered by createdAt DESC', async () => {
    authed();
    // SESSION_ID (viewer) is A on the first row, B on the second, and A
    // again on the third. createdAt is intentionally unsorted to assert
    // the orderBy is applied (not the mock array order).
    const EARLIEST = new Date('2026-03-05T00:00:00.000Z');
    const MIDDLE = new Date('2026-03-05T00:00:01.000Z');
    const LATEST = new Date('2026-03-05T00:00:02.000Z');
    const rowA1 = sessionRow({
      id: `c${'a'.repeat(24)}`,
      userAId: SESSION_ID, // viewer on A
      userBId: OTHER_ID,
      status: 'PENDING',
      roomUrl: 'room-1',
      startAt: null,
      endAt: null,
      createdAt: EARLIEST,
    });
    const rowB = sessionRow({
      id: `c${'b'.repeat(24)}`,
      userAId: OTHER_ID, // viewer on B
      userBId: SESSION_ID,
      status: 'PENDING',
      roomUrl: 'room-2',
      startAt: null,
      endAt: null,
      createdAt: LATEST,
    });
    const rowA2 = sessionRow({
      id: `c${'c'.repeat(24)}`,
      userAId: SESSION_ID, // viewer on A
      userBId: OTHER_ID,
      status: 'PENDING',
      roomUrl: 'room-3',
      startAt: null,
      endAt: null,
      createdAt: MIDDLE,
    });
    // Prisma returns rows already ordered by `orderBy` — the mock mirrors
    // what the real query would produce, in DESC order.
    mocks.prisma.videoSession.findMany.mockResolvedValue([rowB, rowA2, rowA1]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/video-sessions'));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(3);
    expect(body.items[0].id).toBe(rowB.id); // LATEST first
    expect(body.items[1].id).toBe(rowA2.id); // MIDDLE
    expect(body.items[2].id).toBe(rowA1.id); // EARLIEST
    for (const item of body.items) {
      expect(item.userAId === SESSION_ID || item.userBId === SESSION_ID).toBe(true);
      expect(item.status).toBe('PENDING');
      expect(typeof item.createdAt).toBe('string');
    }

    expect(mocks.prisma.videoSession.create).not.toHaveBeenCalled();
  });

  it('200 when ?status=pending (lowercase) — uppercase normalised before parse', async () => {
    authed();
    mocks.prisma.videoSession.findMany.mockResolvedValue([]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/video-sessions?status=pending'));
    expect(res.status).toBe(200);

    const args = mocks.prisma.videoSession.findMany.mock.calls[0]?.[0] as {
      where: { status: string };
    };
    expect(args.where.status).toBe('PENDING');
  });
});
