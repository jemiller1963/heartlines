// @polsia:user-owned — vitest for the subscription paywall on
// `POST /api/messages/[threadId]`.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
//
// Mirrors `messages/send.contract.test.ts` in shape — the hoisted mock
// block stubs `@/lib/db`, `@/lib/require-auth`, and
// `@/lib/business/subscription`; each test reimports the route handler so
// the mocks take effect. The shared subscription mock has a
// `subscriptionActive.value` flag flipped per-test with `beforeEach`
// default of `true` (active). The subscription check sits after the
// participant gate and returns 402 when inactive, 200 when active.

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

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

function authed(id = SESSION_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

function threadRow(args: { userAId: string; userBId: string }) {
  return { id: THREAD_ID, userAId: args.userAId, userBId: args.userBId };
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

describe('POST /api/messages/[threadId] — subscription gate', () => {
  it('200 when viewer is subscribed AND a participant', async () => {
    authed();
    mocks.subscriptionActive.value = true;
    mocks.prisma.messageThread.findUnique.mockResolvedValue(
      threadRow({ userAId: SESSION_ID, userBId: OTHER_ID }),
    );
    const MSG_ID = `c${'m'.repeat(24)}`;
    mocks.prisma.$transaction.mockResolvedValue([
      {
        id: MSG_ID,
        threadId: THREAD_ID,
        senderId: SESSION_ID,
        body: 'hi',
        createdAt: new Date('2026-08-10T00:00:00.000Z'),
      },
    ]);

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', {
        method: 'POST',
        body: JSON.stringify({ body: 'hi' }),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prisma.message.create).toHaveBeenCalledTimes(1);
  });

  it('402 when viewer is NOT subscribed (gated AFTER participant gate, BEFORE body parse)', async () => {
    authed();
    mocks.subscriptionActive.value = false;
    mocks.prisma.messageThread.findUnique.mockResolvedValue(
      threadRow({ userAId: SESSION_ID, userBId: OTHER_ID }),
    );

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/messages/x', {
        method: 'POST',
        body: JSON.stringify({ body: 'hi' }),
      }),
      { params: Promise.resolve({ threadId: THREAD_ID }) } as never,
    );
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error).toBe('subscription_required');
    expect(typeof json.message).toBe('string');
    expect(json.message.length).toBeGreaterThan(0);
    // No Prisma writes: the subscription check runs BEFORE the message write.
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('403 fires BEFORE 402 (non-participant gate is in front of the subscription gate)', async () => {
    authed('STRANGER');
    mocks.subscriptionActive.value = false;
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
    // The participant gate runs first; we should get 403, NOT 402, so the
    // non-participant probe doesn't learn whether someone is subscribed.
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Forbidden');
    expect(mocks.prisma.message.create).not.toHaveBeenCalled();
  });
});
