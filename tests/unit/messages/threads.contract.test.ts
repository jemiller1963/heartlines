// @polsia:user-owned — vitest for /api/messages/threads and MessageThreadsList.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Neutralize server-only (`import 'server-only'` is a side-effect-only
// module, so replacing it with an empty object is enough) and stub Prisma +
// requireAuth so the handler runs against a fake DB.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('messages shared contract', () => {
  it('UserId accepts a typical better-auth base36 id and rejects empty / oversize', async () => {
    const id = 'a'.repeat(32);
    const Validation = await import('@/lib/contracts/swipe');
    expect(Validation.UserId.safeParse(id).success).toBe(true);
    expect(Validation.UserId.safeParse('').success).toBe(false);
    expect(Validation.UserId.safeParse('a'.repeat(65)).success).toBe(false);
  });

  it('MessageThreadSummary accepts null lastMessage (brand-new thread)', async () => {
    const { MessageThreadsList } = await import('@/lib/contracts/messages');
    const NOW = new Date().toISOString();
    expect(
      MessageThreadsList.safeParse({
        items: [
          {
            id: `c${'a'.repeat(24)}`,
            userAId: 'user-a',
            userBId: 'user-b',
            lastMessageAt: NOW,
            createdAt: NOW,
            otherParticipant: {
              id: 'user-b',
              name: 'B',
              avatarUrl: null,
              verificationStatus: null,
              age: null,
              city: '',
            },
            lastMessage: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('MessageThreadSummary accepts a populated lastMessage preview', async () => {
    const { MessageThreadsList } = await import('@/lib/contracts/messages');
    const NOW = new Date().toISOString();
    expect(
      MessageThreadsList.safeParse({
        items: [
          {
            id: `c${'a'.repeat(24)}`,
            userAId: 'user-a',
            userBId: 'user-b',
            lastMessageAt: NOW,
            createdAt: NOW,
            otherParticipant: {
              id: 'user-b',
              name: 'B',
              avatarUrl: 'https://cdn.example.com/b.jpg',
              verificationStatus: 'approved',
              age: 30,
              city: 'Paris',
            },
            lastMessage: {
              body: 'hi',
              createdAt: NOW,
              senderId: 'user-b',
            },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('OtherParticipantSummary tolerates all 6 nullable fields', async () => {
    const { MessageThreadsList } = await import('@/lib/contracts/messages');
    const NOW = new Date().toISOString();
    expect(
      MessageThreadsList.safeParse({
        items: [
          {
            id: `c${'a'.repeat(24)}`,
            userAId: 'user-a',
            userBId: 'user-b',
            lastMessageAt: NOW,
            createdAt: NOW,
            otherParticipant: {
              id: 'user-b',
              name: '',
              avatarUrl: null,
              verificationStatus: null,
              age: null,
              city: '',
            },
            lastMessage: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('MessageThreadsList accepts an empty items array', async () => {
    const { MessageThreadsList } = await import('@/lib/contracts/messages');
    expect(MessageThreadsList.safeParse({ items: [] }).success).toBe(true);
  });

  it('MessageThreadSummary rejects a non-cuid id', async () => {
    const { MessageThreadsList } = await import('@/lib/contracts/messages');
    const NOW = new Date().toISOString();
    expect(
      MessageThreadsList.safeParse({
        items: [
          {
            id: 'not-a-cuid',
            userAId: 'user-a',
            userBId: 'user-b',
            lastMessageAt: NOW,
            createdAt: NOW,
            otherParticipant: {
              id: 'user-b',
              name: 'B',
              avatarUrl: null,
              verificationStatus: null,
              age: 30,
              city: 'Paris',
            },
            lastMessage: null,
          },
        ],
      }).success,
    ).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    messageThread: { findMany: vi.fn() },
    message: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    profile: { findMany: vi.fn() },
  };
  const requireAuth = vi.fn();
  return { prisma, requireAuth };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));

const VIEWER_ID = 'viewer-user';
const PEER_ID = 'peer-user';
const PEER_NAME = 'Peer';

function authed(id = VIEWER_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.messageThread.findMany.mockReset();
  mocks.prisma.message.findMany.mockReset();
  mocks.prisma.user.findMany.mockReset();
  mocks.prisma.profile.findMany.mockReset();
  mocks.requireAuth.mockReset();
});

const getRoute = () => import('@/app/api/messages/threads/route');

function threadRow(args: { id: string; userAId: string; userBId: string; lastMessageAt: Date }) {
  return {
    id: args.id,
    userAId: args.userAId,
    userBId: args.userBId,
    lastMessageAt: args.lastMessageAt,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('messages route — auth + empty branches', () => {
  it('returns 401 when requireAuth rejects', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/messages/threads'));
    expect(res.status).toBe(401);
  });

  it('returns 200 with empty items when the viewer has no threads', async () => {
    authed();
    mocks.prisma.messageThread.findMany.mockResolvedValue([]);
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/messages/threads'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
    // Empty → we should not even fire the batched lookups for users / profiles /
    // messages (the early-return avoids the cost).
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.profile.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('does not call user / profile / message lookups when no threads exist', async () => {
    authed();
    mocks.prisma.messageThread.findMany.mockResolvedValue([]);
    const { GET } = await getRoute();
    await GET(new Request('http://test/api/messages/threads'));
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.profile.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe('messages route — happy path with two threads', () => {
  const T_NEWER = `c${'b'.repeat(24)}`;
  const T_OLDER = `c${'a'.repeat(24)}`;

  it('orders threads by lastMessageAt desc and includes participant + preview', async () => {
    authed();
    // Prisma already returns them ordered; the test mirrors that.
    mocks.prisma.messageThread.findMany.mockResolvedValue([
      threadRow({
        id: T_NEWER,
        userAId: VIEWER_ID,
        userBId: PEER_ID,
        lastMessageAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
      threadRow({
        id: T_OLDER,
        userAId: PEER_ID,
        userBId: VIEWER_ID,
        lastMessageAt: new Date('2026-02-01T00:00:00.000Z'),
      }),
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([{ id: PEER_ID, name: PEER_NAME }]);
    mocks.prisma.profile.findMany.mockResolvedValue([
      {
        userId: PEER_ID,
        age: 30,
        location: 'Paris',
        avatarUrl: null,
        verificationStatus: 'approved',
      },
    ]);
    // Newest-first overall — for the T_NEWER thread the most recent is "hi";
    // for T_OLDER it's "first". The handler must take the first hit per
    // thread.
    mocks.prisma.message.findMany.mockResolvedValue([
      {
        threadId: T_NEWER,
        senderId: PEER_ID,
        body: 'hi',
        createdAt: new Date('2026-03-05T00:00:00.000Z'),
      },
      {
        threadId: T_NEWER,
        senderId: VIEWER_ID,
        body: 'older',
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
      },
      {
        threadId: T_OLDER,
        senderId: VIEWER_ID,
        body: 'first',
        createdAt: new Date('2026-02-05T00:00:00.000Z'),
      },
    ]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/messages/threads'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].id).toBe(T_NEWER);
    expect(body.items[0].otherParticipant.id).toBe(PEER_ID);
    expect(body.items[0].otherParticipant.name).toBe(PEER_NAME);
    expect(body.items[0].otherParticipant.city).toBe('Paris');
    expect(body.items[0].otherParticipant.age).toBe(30);
    expect(body.items[0].otherParticipant.verificationStatus).toBe('approved');
    expect(body.items[0].lastMessage).toEqual({
      body: 'hi',
      createdAt: '2026-03-05T00:00:00.000Z',
      senderId: PEER_ID,
    });
    expect(body.items[1].id).toBe(T_OLDER);
    // In the older thread the viewer is on the B side — the handler must
    // still surface the peer correctly.
    expect(body.items[1].otherParticipant.id).toBe(PEER_ID);
    expect(body.items[1].lastMessage).toEqual({
      body: 'first',
      createdAt: '2026-02-05T00:00:00.000Z',
      senderId: VIEWER_ID,
    });
  });
});

describe('messages route — missing join rows', () => {
  it('renders honest nulls when the peer has no Profile row', async () => {
    authed();
    mocks.prisma.messageThread.findMany.mockResolvedValue([
      threadRow({
        id: `c${'a'.repeat(24)}`,
        userAId: VIEWER_ID,
        userBId: PEER_ID,
        lastMessageAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([{ id: PEER_ID, name: PEER_NAME }]);
    mocks.prisma.profile.findMany.mockResolvedValue([]); // no profile yet
    mocks.prisma.message.findMany.mockResolvedValue([]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/messages/threads'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].otherParticipant.name).toBe(PEER_NAME);
    expect(body.items[0].otherParticipant.age).toBeNull();
    expect(body.items[0].otherParticipant.city).toBe('');
    expect(body.items[0].otherParticipant.avatarUrl).toBeNull();
    expect(body.items[0].otherParticipant.verificationStatus).toBeNull();
    expect(body.items[0].lastMessage).toBeNull();
  });

  it('renders an empty name when the peer has no User row (FK race)', async () => {
    authed();
    mocks.prisma.messageThread.findMany.mockResolvedValue([
      threadRow({
        id: `c${'a'.repeat(24)}`,
        userAId: VIEWER_ID,
        userBId: PEER_ID,
        lastMessageAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([]); // FK race lost
    mocks.prisma.profile.findMany.mockResolvedValue([]);
    mocks.prisma.message.findMany.mockResolvedValue([]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/messages/threads'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].otherParticipant.name).toBe('');
  });

  it('forwards the session id into the thread where-clause (no request-side userId leak)', async () => {
    authed();
    const captured = vi.fn();
    mocks.prisma.messageThread.findMany.mockImplementation((args) => {
      captured(args);
      return Promise.resolve([]);
    });

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/messages/threads?userId=NEVER'));
    expect(res.status).toBe(200);
    const where = captured.mock.calls[0]?.[0]?.where;
    expect(where.OR).toEqual([{ userAId: VIEWER_ID }, { userBId: VIEWER_ID }]);
    // The handler must NEVER honor a userId from the request body or query.
    expect(JSON.stringify(where)).not.toContain('NEVER');
  });
});
