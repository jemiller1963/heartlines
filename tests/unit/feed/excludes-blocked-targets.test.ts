// @vitest-environment node
// @polsia:user-owned — vitest for /api/feed, focused on the block-exclusion
// wiring (POST /api/blocks recorded → GET /api/feed omits the blocked target
// while keeping C and existing swipe/seen exclusions).
//
// `// @vitest-environment node` is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Neutralize server-only and stub Prisma + requireAuth so the handlers run
// against a fake DB.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    profile: { findUnique: vi.fn(), findMany: vi.fn() },
    swipe: { findMany: vi.fn() },
    block: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
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
  mocks.requireAuth.mockReset();
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
        candidateRow('bbb', BLOCKED_USER, 30, 'Paris', ['hiking', 'cooking', 'jazz']),
        candidateRow('ccc', KEEP_USER, 30, 'Paris', ['hiking', 'cooking', 'jazz']),
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
        candidateRow('bbb', BLOCKED_USER, 30, 'Paris', ['hiking', 'cooking', 'jazz']),
        candidateRow('ddd', SWIPED_USER, 30, 'Paris', ['hiking', 'cooking', 'jazz']),
        candidateRow('eee', ALSO_KEEP_USER, 30, 'Paris', ['hiking', 'cooking', 'jazz']),
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

// --- GET /api/feed — empty blocks + empty swipes -----------------------------

describe('GET /api/feed — empty blocks + empty swipes', () => {
  it('keeps C, hasProfile: true, nextCursor: null (sanity / no-regression)', async () => {
    authed('user-A');
    mocks.prisma.profile.findUnique.mockResolvedValue(VIEWER_PROFILE);
    mocks.prisma.swipe.findMany.mockResolvedValue([]);
    mocks.prisma.block.findMany.mockResolvedValue([]);

    mocks.prisma.profile.findMany.mockResolvedValue([
      candidateRow('ccc', KEEP_USER, 30, 'Paris', ['hiking', 'cooking', 'jazz']),
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
