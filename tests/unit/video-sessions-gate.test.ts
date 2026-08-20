// @polsia:user-owned — vitest for the subscription paywall on
// `POST /api/video-sessions` and `PATCH /api/video-sessions/[id]`. Only the
// `accept` action is gated; `decline` / `cancel` / `end` flow through so
// free users can always clean up their inbox.
//
// // @vitest-environment node is required: vitest defaults to jsdom, in
// which `Response.json` is not defined globally. The subscription mock
// throws a 402 `Response` so we need the Node env.

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    swipe: { findFirst: vi.fn() },
    connection: { findFirst: vi.fn() },
    videoSession: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
const SESSION_CUID = `c${'a'.repeat(24)}`;

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
  mocks.prisma.videoSession.findUnique.mockReset();
  mocks.prisma.videoSession.update.mockReset();
  mocks.requireAuth.mockReset();
});

const postRoute = () => import('@/app/api/video-sessions/route');
const patchRoute = () => import('@/app/api/video-sessions/[id]/route');

describe('POST /api/video-sessions — subscription gate', () => {
  it('200 when subscribed + matched', async () => {
    authed();
    mocks.subscriptionActive.value = true;
    mocks.prisma.swipe.findFirst.mockResolvedValue({ id: 'ab' });
    mocks.prisma.connection.findFirst.mockResolvedValue(null);
    mocks.prisma.videoSession.create.mockResolvedValue({
      id: SESSION_CUID,
      userAId: OTHER_ID,
      userBId: SESSION_ID,
      senderId: SESSION_ID,
      status: 'PENDING',
      roomUrl: 'room-token',
      startAt: null,
      endAt: null,
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    });

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

  it('402 when NOT subscribed (all earlier gates pass)', async () => {
    authed();
    mocks.subscriptionActive.value = false;
    mocks.prisma.swipe.findFirst.mockResolvedValue({ id: 'ab' });
    mocks.prisma.connection.findFirst.mockResolvedValue(null);

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/video-sessions', {
        method: 'POST',
        body: JSON.stringify({ toUserId: OTHER_ID }),
      }),
    );
    expect(res.status).toBe(402);
    const json = await res.json();
    expect(json.error).toBe('subscription_required');
    expect(mocks.prisma.videoSession.create).not.toHaveBeenCalled();
  });

  it('403 fires BEFORE 402 (no-match gate is in front of the subscription gate)', async () => {
    authed();
    mocks.subscriptionActive.value = false;
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
    // The brief says create calls must never leak through 402 paths.
    expect(mocks.prisma.videoSession.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/video-sessions/[id] — subscription gate', () => {
  function existingRow(status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'CANCELLED') {
    return {
      id: SESSION_CUID,
      userAId: OTHER_ID,
      userBId: SESSION_ID,
      status,
    };
  }

  it('200 on PENDING:accept when subscribed', async () => {
    authed();
    mocks.subscriptionActive.value = true;
    mocks.prisma.videoSession.findUnique.mockResolvedValue(existingRow('PENDING'));
    mocks.prisma.videoSession.update.mockResolvedValue({
      id: SESSION_CUID,
      userAId: OTHER_ID,
      userBId: SESSION_ID,
      senderId: OTHER_ID,
      status: 'ACTIVE',
      roomUrl: 'room-token',
      startAt: new Date('2026-08-10T00:00:00.000Z'),
      endAt: null,
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    });

    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prisma.videoSession.update).toHaveBeenCalledTimes(1);
  });

  it('402 on PENDING:accept when NOT subscribed', async () => {
    authed();
    mocks.subscriptionActive.value = false;
    mocks.prisma.videoSession.findUnique.mockResolvedValue(existingRow('PENDING'));

    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('subscription_required');
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('200 on PENDING:decline when NOT subscribed (not gated)', async () => {
    authed();
    mocks.subscriptionActive.value = false;
    mocks.prisma.videoSession.findUnique.mockResolvedValue(existingRow('PENDING'));
    mocks.prisma.videoSession.update.mockResolvedValue({
      id: SESSION_CUID,
      userAId: OTHER_ID,
      userBId: SESSION_ID,
      senderId: OTHER_ID,
      status: 'CANCELLED',
      roomUrl: 'room-token',
      startAt: null,
      endAt: null,
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    });

    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'decline' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(200);
    expect(mocks.prisma.videoSession.update).toHaveBeenCalledTimes(1);
  });

  it('200 on PENDING:cancel when NOT subscribed (not gated)', async () => {
    authed();
    mocks.subscriptionActive.value = false;
    mocks.prisma.videoSession.findUnique.mockResolvedValue(existingRow('PENDING'));
    mocks.prisma.videoSession.update.mockResolvedValue({
      id: SESSION_CUID,
      userAId: OTHER_ID,
      userBId: SESSION_ID,
      senderId: OTHER_ID,
      status: 'CANCELLED',
      roomUrl: 'room-token',
      startAt: null,
      endAt: null,
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    });

    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(200);
  });

  it('200 on ACTIVE:end when NOT subscribed (not gated)', async () => {
    authed();
    mocks.subscriptionActive.value = false;
    mocks.prisma.videoSession.findUnique.mockResolvedValue(existingRow('ACTIVE'));
    mocks.prisma.videoSession.update.mockResolvedValue({
      id: SESSION_CUID,
      userAId: OTHER_ID,
      userBId: SESSION_ID,
      senderId: OTHER_ID,
      status: 'ENDED',
      roomUrl: 'room-token',
      startAt: null,
      endAt: new Date('2026-08-10T00:00:00.000Z'),
      createdAt: new Date('2026-08-10T00:00:00.000Z'),
    });

    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'end' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(200);
  });
});
