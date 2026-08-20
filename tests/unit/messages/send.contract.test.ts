// @polsia:user-owned — vitest for POST /api/messages/[threadId] + the
// MessageSend/Message/MessageResult contracts.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
//
// Mirrors threads.contract.test.ts in shape — `vi.mock('server-only', () =>
// ({}))` neutralizes the side-effect-only import, the hoisted mock block
// stubs `@/lib/db` and `@/lib/require-auth`, and each test reimports the
// route handler so the mocks take effect.
//
// The handler uses `prisma.$transaction([...])` with TWO operations in the
// array (create + update); only the first is read. The hoisted mock returns
// a tuple `[createdRow, undefined]` to mirror Prisma's real shape.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('messages send contract', () => {
  it('MessageSend rejects an empty body (and whitespace-only) and accepts non-empty', async () => {
    const { MessageSend } = await import('@/lib/contracts/messages');
    expect(MessageSend.safeParse({ body: '' }).success).toBe(false);
    expect(MessageSend.safeParse({ body: '   ' }).success).toBe(false);
    expect(MessageSend.safeParse({ body: '\n\t  \n' }).success).toBe(false);
    expect(MessageSend.safeParse({ body: 'hi' }).success).toBe(true);
  });

  it('MessageSend rejects a body over 2000 chars (and accepts exactly 2000)', async () => {
    const { MessageSend } = await import('@/lib/contracts/messages');
    expect(MessageSend.safeParse({ body: 'a'.repeat(2001) }).success).toBe(false);
    expect(MessageSend.safeParse({ body: 'a'.repeat(2000) }).success).toBe(true);
  });

  it('MessageSend trims the body before validating length', async () => {
    const { MessageSend } = await import('@/lib/contracts/messages');
    // ' hello ' → 'hello' after trim, well within the limit.
    expect(MessageSend.parse({ body: ' hello ' })).toEqual({ body: 'hello' });
  });

  it('MessageResult accepts a well-formed outgoing shape and rejects a bad ids', async () => {
    const { MessageResult } = await import('@/lib/contracts/messages');
    const THREAD_ID = `c${'a'.repeat(24)}`;
    const NOW = '2026-03-05T00:00:00.000Z';
    expect(
      MessageResult.safeParse({
        id: `c${'b'.repeat(24)}`,
        threadId: THREAD_ID,
        senderId: 'user-a',
        body: 'hi',
        createdAt: NOW,
      }).success,
    ).toBe(true);
    expect(
      MessageResult.safeParse({
        id: 'not-a-cuid',
        threadId: THREAD_ID,
        senderId: 'user-a',
        body: 'hi',
        createdAt: NOW,
      }).success,
    ).toBe(false);
    expect(
      MessageResult.safeParse({
        id: `c${'b'.repeat(24)}`,
        threadId: 'not-a-cuid',
        senderId: 'user-a',
        body: 'hi',
        createdAt: NOW,
      }).success,
    ).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    messageThread: { findUnique: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
    $transaction: vi.fn(),
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
const THREAD_ID = `c${'a'.repeat(24)}`;

function threadRow(args: { userAId: string; userBId: string }) {
  return { id: THREAD_ID, userAId: args.userAId, userBId: args.userBId };
}

function authed(id = SESSION_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

function messageRow(args: {
  id: string;
  threadId: string;
  senderId: string;
  body: string;
  createdAt: Date;
}) {
  return {
    id: args.id,
    threadId: args.threadId,
    senderId: args.senderId,
    body: args.body,
    createdAt: args.createdAt,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.subscriptionActive.value = true;
  mocks.prisma.messageThread.findUnique.mockReset();
  mocks.prisma.message.create.mockReset();
  mocks.prisma.messageThread.update.mockReset();
  mocks.prisma.$transaction.mockReset();
  mocks.requireAuth.mockReset();
});

const postRoute = () => import('@/app/api/messages/[threadId]/route');

describe('POST /api/messages/[threadId] — auth + access gates', () => {
  it('401 when requireAuth rejects (no Prisma calls)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', { method: 'POST', body: '{}' }),
      // Cast: the runtime only awaits params; the test doesn't need a real Promise shape.
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(401);
    expect(mocks.prisma.messageThread.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
    expect(mocks.prisma.messageThread.update).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('403 when session.id is neither userAId nor userBId (no writes)', async () => {
    authed('STRANGER');
    mocks.prisma.messageThread.findUnique.mockResolvedValue(
      threadRow({ userAId: 'A', userBId: 'B' }),
    );
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', {
        method: 'POST',
        body: JSON.stringify({ body: 'hi' }),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(403);
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
    expect(mocks.prisma.messageThread.update).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('404 when thread does not exist (no user lookup; FK scan via the thread row is enough)', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue(null);
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', {
        method: 'POST',
        body: JSON.stringify({ body: 'hi' }),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Thread not found' });
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
    expect(mocks.prisma.messageThread.update).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('400 when the path-segment threadId is not a cuid', async () => {
    authed();
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/not-a-cuid', {
        method: 'POST',
        body: JSON.stringify({ body: 'hi' }),
      }),
      { params: Promise.resolve({ threadId: 'not-a-cuid' }) } as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.threadId).toBe('Invalid thread id');
    expect(mocks.prisma.messageThread.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/messages/[threadId] — body validation', () => {
  it('400 on empty body (and on whitespace-only) — no Prisma writes', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue(
      threadRow({ userAId: SESSION_ID, userBId: OTHER_ID }),
    );
    const { POST } = await postRoute();

    for (const body of ['', '   ', '\n\t  \n']) {
      const res = await POST(
        new Request('http://test/api/messages/x', {
          method: 'POST',
          body: JSON.stringify({ body }),
        }),
        { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.errors).toBeDefined();
      expect(typeof json.errors.body).toBe('string');
      expect(json.errors.body.length).toBeGreaterThan(0);
    }
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
    expect(mocks.prisma.messageThread.update).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('400 when body is missing the field entirely', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue(
      threadRow({ userAId: SESSION_ID, userBId: OTHER_ID }),
    );
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(400);
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('POST /api/messages/[threadId] — happy path', () => {
  beforeEach(() => {
    // Prisma's $transaction([...]) receives the array of operations; each
    // element is a PrismaPromise carrying the original call args. Stand the
    // mocks up as identity functions so the array the route passes in keeps
    // its `data` / `where` shapes for assertion.
    mocks.prisma.message.create.mockImplementation((args: unknown) => args);
    mocks.prisma.messageThread.update.mockImplementation((args: unknown) => args);
  });

  it('200, atomic transaction, senderId from session (never from the body), bumps lastMessageAt', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue(
      threadRow({ userAId: SESSION_ID, userBId: OTHER_ID }),
    );
    // `$transaction` returns the FIRST element only (drop the update result).
    const MSG_ID = `c${'b'.repeat(24)}`;
    const CREATED_AT = new Date('2026-03-05T00:00:00.000Z');
    const created = messageRow({
      id: MSG_ID,
      threadId: THREAD_ID,
      senderId: SESSION_ID,
      body: 'hi there',
      createdAt: CREATED_AT,
    });
    mocks.prisma.$transaction.mockResolvedValue([created]);

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', {
        method: 'POST',
        body: JSON.stringify({ body: 'hi there' }),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(200);

    // Body shape matches the contract.
    const json = await res.json();
    expect(json.id).toBe(MSG_ID);
    expect(json.threadId).toBe(THREAD_ID);
    expect(json.senderId).toBe(SESSION_ID);
    expect(json.body).toBe('hi there');
    expect(json.createdAt).toBe(CREATED_AT.toISOString());

    // Atomic transaction: ONE $transaction call carrying BOTH ops.
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    const txArg = mocks.prisma.$transaction.mock.calls[0]?.[0];
    expect(Array.isArray(txArg)).toBe(true);
    expect(txArg).toHaveLength(2);

    // senderId MUST be the session id, NEVER whatever the body might carry.
    const createOp = txArg[0] as { data: { senderId: string; body: string; threadId: string } };
    expect(createOp.data.senderId).toBe(SESSION_ID);
    expect(createOp.data.body).toBe('hi there');
    expect(createOp.data.threadId).toBe(THREAD_ID);

    // Update carries the matching threadId and a Date (any Date — the route
    // just needs `lastMessageAt` bumped in the same write).
    const updateOp = txArg[1] as {
      where: { id: string };
      data: { lastMessageAt: unknown };
    };
    expect(updateOp.where).toEqual({ id: THREAD_ID });
    expect(updateOp.data.lastMessageAt).toBeInstanceOf(Date);

    // Standalone mocks only ran for create+update through the transaction
    // argument path — they aren't called directly.
    expect(mocks.prisma.message.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.messageThread.update).toHaveBeenCalledTimes(1);
  });

  it('200 on the OTHER side of the participant pair (userBId matches session)', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue(
      threadRow({ userAId: OTHER_ID, userBId: SESSION_ID }),
    );
    const MSG_ID = `c${'c'.repeat(24)}`;
    const created = messageRow({
      id: MSG_ID,
      threadId: THREAD_ID,
      senderId: SESSION_ID,
      body: 'reply',
      createdAt: new Date('2026-03-06T00:00:00.000Z'),
    });
    mocks.prisma.$transaction.mockResolvedValue([created]);

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', {
        method: 'POST',
        body: JSON.stringify({ body: 'reply' }),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).senderId).toBe(SESSION_ID);
  });

  it('forwards the trimmed body into the create op (whitespace is gone)', async () => {
    authed();
    mocks.prisma.messageThread.findUnique.mockResolvedValue(
      threadRow({ userAId: SESSION_ID, userBId: OTHER_ID }),
    );
    const created = messageRow({
      id: `c${'d'.repeat(24)}`,
      threadId: THREAD_ID,
      senderId: SESSION_ID,
      body: 'hello',
      createdAt: new Date('2026-03-07T00:00:00.000Z'),
    });
    mocks.prisma.$transaction.mockResolvedValue([created]);

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', {
        method: 'POST',
        body: JSON.stringify({ body: '  hello  ' }),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(200);
    const txArg = mocks.prisma.$transaction.mock.calls[0]?.[0];
    const createOp = txArg[0] as { data: { body: string } };
    expect(createOp.data.body).toBe('hello');
  });
});
