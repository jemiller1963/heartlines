// @polsia:user-owned — vitest for GET /api/messages/[threadId]/messages +
// the MessageItem/MessageHistoryQuery/MessageHistoryPage contracts.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
//
// Mirrors send.contract.test.ts and threads.contract.test.ts in shape —
// `vi.mock('server-only', () => ({}))` neutralizes the side-effect-only import,
// the hoisted mock block stubs `@/lib/db` and `@/lib/require-auth`, and each
// test reimports the route handler so the mocks take effect.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('MessageItem contract', () => {
  it('rejects a non-cuid id', async () => {
    const { MessageItem } = await import('@/lib/contracts/messages');
    const base = {
      id: `c${'a'.repeat(24)}`,
      threadId: `c${'b'.repeat(24)}`,
      senderId: 'user-a',
      senderName: 'Alice',
      body: 'hello',
      createdAt: '2026-03-05T00:00:00.000Z',
    };
    expect(MessageItem.safeParse({ ...base, id: 'not-a-cuid' }).success).toBe(false);
    expect(MessageItem.safeParse(base).success).toBe(true);
  });

  it('rejects a non-datetime createdAt', async () => {
    const { MessageItem } = await import('@/lib/contracts/messages');
    const base = {
      id: `c${'a'.repeat(24)}`,
      threadId: `c${'b'.repeat(24)}`,
      senderId: 'user-a',
      senderName: '',
      body: 'hi',
      createdAt: '2026-03-05T00:00:00.000Z',
    };
    expect(MessageItem.safeParse({ ...base, createdAt: 'not-a-date' }).success).toBe(false);
    expect(MessageItem.safeParse({ ...base, createdAt: '2026-03-05' }).success).toBe(false);
    expect(MessageItem.safeParse(base).success).toBe(true);
  });
});

describe('MessageHistoryPage contract', () => {
  it('accepts items: [] and nextCursor: null', async () => {
    const { MessageHistoryPage } = await import('@/lib/contracts/messages');
    expect(MessageHistoryPage.safeParse({ items: [], nextCursor: null }).success).toBe(true);
  });
});

describe('MessageHistoryQuery contract', () => {
  it('accepts {} (no cursor)', async () => {
    const { MessageHistoryQuery } = await import('@/lib/contracts/messages');
    expect(MessageHistoryQuery.safeParse({}).success).toBe(true);
  });

  it('accepts a valid cuid cursor', async () => {
    const { MessageHistoryQuery } = await import('@/lib/contracts/messages');
    expect(MessageHistoryQuery.safeParse({ cursor: `c${'a'.repeat(24)}` }).success).toBe(true);
  });

  it('rejects a non-cuid string as cursor', async () => {
    const { MessageHistoryQuery } = await import('@/lib/contracts/messages');
    expect(MessageHistoryQuery.safeParse({ cursor: 'not-a-cuid' }).success).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    messageThread: { findUnique: vi.fn() },
    message: { findMany: vi.fn() },
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

const SESSION_ID = 'viewer-user';
const OTHER_ID = 'other-user';
const THREAD_ID = `c${'a'.repeat(24)}`;
const MSG_A = `c${'b'.repeat(24)}`;
const MSG_B = `c${'c'.repeat(24)}`;

function authed(id = SESSION_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.messageThread.findUnique.mockReset();
  mocks.prisma.message.findMany.mockReset();
  mocks.prisma.user.findMany.mockReset();
  mocks.requireAuth.mockReset();
});

const getRoute = () => import('@/app/api/messages/[threadId]/messages/route');

describe('GET /api/messages/[threadId]/messages — auth + access gates', () => {
  it('401 when requireAuth rejects — no Prisma calls', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/messages/${THREAD_ID}/messages`), {
      params: Promise.resolve({ threadId: THREAD_ID }),
    } as never);
    expect(res.status).toBe(401);
    expect(mocks.prisma.messageThread.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('403 IDOR — thread exists but session is neither participant', async () => {
    authed('STRANGER');
    mocks.prisma.messageThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      userAId: 'A',
      userBId: 'B',
    });
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/messages/${THREAD_ID}/messages`), {
      params: Promise.resolve({ threadId: THREAD_ID }),
    } as never);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(mocks.prisma.message.findMany).not.toHaveBeenCalled();
  });

  it('404 — thread missing', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue(null);
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/messages/${THREAD_ID}/messages`), {
      params: Promise.resolve({ threadId: THREAD_ID }),
    } as never);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Thread not found' });
    expect(mocks.prisma.message.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/messages/[threadId]/messages — happy path', () => {
  it('200 empty — no messages, user.findMany not called', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      userAId: SESSION_ID,
      userBId: OTHER_ID,
    });
    mocks.prisma.message.findMany.mockResolvedValue([]);
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/messages/${THREAD_ID}/messages`), {
      params: Promise.resolve({ threadId: THREAD_ID }),
    } as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toEqual([]);
    expect(json.nextCursor).toBeNull();
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('200 ordered with multiple senders — senderName joined, DESC order, nextCursor null', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      userAId: SESSION_ID,
      userBId: OTHER_ID,
    });
    mocks.prisma.message.findMany.mockResolvedValue([
      {
        id: MSG_A,
        threadId: THREAD_ID,
        senderId: 'sender-1',
        body: 'hello',
        createdAt: new Date('2026-03-05T02:00:00.000Z'),
      },
      {
        id: MSG_B,
        threadId: THREAD_ID,
        senderId: 'sender-2',
        body: 'world',
        createdAt: new Date('2026-03-05T01:00:00.000Z'),
      },
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: 'sender-1', name: 'Alice' },
      { id: 'sender-2', name: 'Bob' },
    ]);
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/messages/${THREAD_ID}/messages`), {
      params: Promise.resolve({ threadId: THREAD_ID }),
    } as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items[0].senderName).toBe('Alice');
    expect(json.items[1].senderName).toBe('Bob');
    // DESC order: first item createdAt > second item createdAt
    expect(json.items[0].createdAt > json.items[1].createdAt).toBe(true);
    expect(json.nextCursor).toBeNull();
  });
});

describe('GET /api/messages/[threadId]/messages — cursor pagination', () => {
  it('nextCursor is null when page has fewer items than PAGE_SIZE', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      userAId: SESSION_ID,
      userBId: OTHER_ID,
    });
    // Only 1 item — well below PAGE_SIZE (20)
    mocks.prisma.message.findMany.mockResolvedValue([
      {
        id: MSG_A,
        threadId: THREAD_ID,
        senderId: SESSION_ID,
        body: 'single',
        createdAt: new Date('2026-03-05T00:00:00.000Z'),
      },
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([{ id: SESSION_ID, name: 'Me' }]);
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/messages/${THREAD_ID}/messages`), {
      params: Promise.resolve({ threadId: THREAD_ID }),
    } as never);
    const json = await res.json();
    expect(json.nextCursor).toBeNull();
  });

  it('nextCursor is the last item id when PAGE_SIZE + 1 rows returned', async () => {
    const PAGE_SIZE = 20;
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      userAId: SESSION_ID,
      userBId: OTHER_ID,
    });
    // Generate PAGE_SIZE + 1 rows
    const rows = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
      id: `c${String(i).padStart(24, 'a')}`,
      threadId: THREAD_ID,
      senderId: SESSION_ID,
      body: `msg ${i}`,
      createdAt: new Date(Date.now() - i * 1000),
    }));
    mocks.prisma.message.findMany.mockResolvedValue(rows);
    mocks.prisma.user.findMany.mockResolvedValue([{ id: SESSION_ID, name: 'Me' }]);
    const { GET } = await getRoute();
    const res = await GET(new Request(`http://test/api/messages/${THREAD_ID}/messages`), {
      params: Promise.resolve({ threadId: THREAD_ID }),
    } as never);
    const json = await res.json();
    expect(json.items).toHaveLength(PAGE_SIZE);
    // nextCursor is the 20th item's id (index 19), not the 21st (index 20)
    expect(json.nextCursor).toBe(rows[PAGE_SIZE - 1].id);
  });

  it('cursor arg is forwarded to findMany with skip: 1', async () => {
    const CURSOR_ID = `c${'f'.repeat(24)}`;
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue({
      id: THREAD_ID,
      userAId: SESSION_ID,
      userBId: OTHER_ID,
    });
    mocks.prisma.message.findMany.mockResolvedValue([]);
    const { GET } = await getRoute();
    await GET(new Request(`http://test/api/messages/${THREAD_ID}/messages?cursor=${CURSOR_ID}`), {
      params: Promise.resolve({ threadId: THREAD_ID }),
    } as never);
    const callArgs = mocks.prisma.message.findMany.mock.calls[0]?.[0] as {
      cursor: { id: string };
      skip: number;
    };
    expect(callArgs.cursor).toEqual({ id: CURSOR_ID });
    expect(callArgs.skip).toBe(1);
  });
});
