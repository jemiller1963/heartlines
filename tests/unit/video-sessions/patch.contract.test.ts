// @polsia:user-owned — vitest for PATCH /api/video-sessions/[id] + the
// VideoSessionPatch contract.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
//
// Mirrors `messages/send.contract.test.ts` in shape — `vi.mock('server-only',
// () => ({}))` neutralizes the side-effect-only import, the hoisted mock
// block stubs `@/lib/db` and `@/lib/require-auth`, and each test reimports
// the route handler so the mocks take effect.
//
// Guard order asserted in this file matches the route file header: auth
// (401) → cuid check (400) → fetch → 404 (missing) → participant gate (403)
// → body parse (400) → transition table (200 or 400 illegal).

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('video-sessions patch contract', () => {
  it('VideoSessionPatch accepts all four action verbs', async () => {
    const { VideoSessionPatch } = await import('@/lib/contracts/video-sessions');
    expect(VideoSessionPatch.safeParse({ action: 'accept' }).success).toBe(true);
    expect(VideoSessionPatch.safeParse({ action: 'decline' }).success).toBe(true);
    expect(VideoSessionPatch.safeParse({ action: 'cancel' }).success).toBe(true);
    expect(VideoSessionPatch.safeParse({ action: 'end' }).success).toBe(true);
  });

  it('VideoSessionPatch rejects an unknown action verb', async () => {
    const { VideoSessionPatch } = await import('@/lib/contracts/video-sessions');
    expect(VideoSessionPatch.safeParse({ action: 'abort' }).success).toBe(false);
    expect(VideoSessionPatch.safeParse({ action: '' }).success).toBe(false);
  });

  it('VideoSessionPatch rejects a missing action and an uppercase action', async () => {
    const { VideoSessionPatch } = await import('@/lib/contracts/video-sessions');
    expect(VideoSessionPatch.safeParse({}).success).toBe(false);
    expect(VideoSessionPatch.safeParse({ action: 'ACCEPT' }).success).toBe(false);
  });

  it('VideoSessionStatus enum now contains CANCELLED (mirror of schema)', async () => {
    const { VideoSessionStatus } = await import('@/lib/contracts/video-sessions');
    expect(VideoSessionStatus.options).toContain('CANCELLED');
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    videoSession: { findUnique: vi.fn(), update: vi.fn() },
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
const STRANGER_ID = 'stranger-user';
const SESSION_CUID = `c${'a'.repeat(24)}`;

function authed(id = SESSION_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

function existingRow(args: {
  id?: string;
  userAId: string;
  userBId: string;
  status: 'PENDING' | 'ACTIVE' | 'ENDED' | 'CANCELLED';
}) {
  return {
    id: args.id ?? SESSION_CUID,
    userAId: args.userAId,
    userBId: args.userBId,
    status: args.status,
  };
}

function updatedRow(args: {
  status: 'ACTIVE' | 'ENDED' | 'CANCELLED';
  startAt?: Date | null;
  endAt?: Date | null;
}) {
  return {
    id: SESSION_CUID,
    userAId: OTHER_ID,
    userBId: SESSION_ID,
    status: args.status,
    roomUrl: 'room-token',
    startAt: args.startAt ?? null,
    endAt: args.endAt ?? null,
    createdAt: new Date('2026-03-05T00:00:00.000Z'),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.subscriptionActive.value = true;
  mocks.prisma.videoSession.findUnique.mockReset();
  mocks.prisma.videoSession.update.mockReset();
  mocks.requireAuth.mockReset();
});

const patchRoute = () => import('@/app/api/video-sessions/[id]/route');

describe('PATCH /api/video-sessions/[id] — auth + path gates', () => {
  it('401 when requireAuth rejects (no prisma calls)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', { method: 'PATCH', body: '{}' }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(401);
    expect(mocks.prisma.videoSession.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('400 when path id is not a cuid (no prisma calls)', async () => {
    authed();
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/not-a-cuid', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: 'not-a-cuid' }) } as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.id).toBe('Invalid session id');
    expect(mocks.prisma.videoSession.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('404 when row does not exist', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(null);
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Session not found');
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('403 when viewer is not userAId or userBId (no update)', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: STRANGER_ID, status: 'PENDING' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden');
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('400 when body action is an unknown verb (update NOT called)', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'PENDING' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'abort' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors.action).toBe('pick accept, decline, cancel, or end');
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('400 when body action is missing', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'PENDING' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(400);
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/video-sessions/[id] — happy paths', () => {
  it('200 on PENDING:accept → ACTIVE with startAt set', async () => {
    authed();
    const UPDATE_TIME = new Date('2026-08-10T12:00:01.000Z');
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'PENDING' }),
    );
    mocks.prisma.videoSession.update.mockResolvedValue(
      updatedRow({ status: 'ACTIVE', startAt: UPDATE_TIME, endAt: null }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ACTIVE');
    expect(typeof json.startAt).toBe('string');
    expect(json.endAt).toBeNull();

    const updateArgs = mocks.prisma.videoSession.update.mock.calls[0]?.[0] as {
      where: { id: string };
      data: { status: string; startAt?: Date; endAt?: Date };
    };
    expect(updateArgs.where.id).toBe(SESSION_CUID);
    expect(updateArgs.data.status).toBe('ACTIVE');
    expect(updateArgs.data.startAt).toBeInstanceOf(Date);
    expect(updateArgs.data.endAt).toBeUndefined();
  });

  it('200 on PENDING:decline → CANCELLED (no startAt/endAt written)', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'PENDING' }),
    );
    mocks.prisma.videoSession.update.mockResolvedValue(
      updatedRow({ status: 'CANCELLED', startAt: null, endAt: null }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'decline' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('CANCELLED');
    expect(json.startAt).toBeNull();
    expect(json.endAt).toBeNull();

    const updateArgs = mocks.prisma.videoSession.update.mock.calls[0]?.[0] as {
      data: { status: string; startAt?: Date; endAt?: Date };
    };
    expect(updateArgs.data.status).toBe('CANCELLED');
    expect(updateArgs.data.startAt).toBeUndefined();
    expect(updateArgs.data.endAt).toBeUndefined();
  });

  it('200 on PENDING:cancel → CANCELLED (no startAt/endAt written)', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'PENDING' }),
    );
    mocks.prisma.videoSession.update.mockResolvedValue(
      updatedRow({ status: 'CANCELLED', startAt: null, endAt: null }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('CANCELLED');

    const updateArgs = mocks.prisma.videoSession.update.mock.calls[0]?.[0] as {
      data: { status: string; startAt?: Date; endAt?: Date };
    };
    expect(updateArgs.data.status).toBe('CANCELLED');
    expect(updateArgs.data.startAt).toBeUndefined();
    expect(updateArgs.data.endAt).toBeUndefined();
  });

  it('200 on ACTIVE:end → ENDED with endAt set', async () => {
    authed();
    const UPDATE_TIME = new Date('2026-08-10T12:00:05.000Z');
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'ACTIVE' }),
    );
    mocks.prisma.videoSession.update.mockResolvedValue(
      updatedRow({ status: 'ENDED', startAt: null, endAt: UPDATE_TIME }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'end' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ENDED');
    expect(json.startAt).toBeNull();
    expect(typeof json.endAt).toBe('string');

    const updateArgs = mocks.prisma.videoSession.update.mock.calls[0]?.[0] as {
      data: { status: string; startAt?: Date; endAt?: Date };
    };
    expect(updateArgs.data.status).toBe('ENDED');
    expect(updateArgs.data.endAt).toBeInstanceOf(Date);
    expect(updateArgs.data.startAt).toBeUndefined();
  });

  it('returns the updated row via VideoSessionResult — viewer can be the A side', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: SESSION_ID, userBId: OTHER_ID, status: 'PENDING' }),
    );
    // The mock returns what prisma.update would return: the row read+update
    // round-trip preserves the canonical pair (A=B < S_VIEWER == 'v' < 'o',
    // so SESSION is B and OTHER is A). The viewer-A side implies SESSION is
    // userAId, OTHER is userBId — match the existing row shape.
    mocks.prisma.videoSession.update.mockResolvedValue({
      id: SESSION_CUID,
      userAId: SESSION_ID,
      userBId: OTHER_ID,
      status: 'ACTIVE',
      roomUrl: 'room-token',
      startAt: new Date('2026-08-10T12:00:02.000Z'),
      endAt: null,
      createdAt: new Date('2026-03-05T00:00:00.000Z'),
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
    const json = await res.json();
    expect(json.userAId).toBe(SESSION_ID);
    expect(json.userBId).toBe(OTHER_ID);
    expect(json.roomUrl).toBe('room-token');
    expect(json.status).toBe('ACTIVE');
  });
});

describe('PATCH /api/video-sessions/[id] — illegal transitions 400', () => {
  it('400 on ACTIVE:accept', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'ACTIVE' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors.action).toMatch(/^Illegal transition: ACTIVE → accept$/);
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('400 on ENDED:accept', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'ENDED' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(400);
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('400 on ENDED:end', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'ENDED' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'end' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(400);
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('400 on PENDING:end', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'PENDING' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'end' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.errors.action).toMatch(/^Illegal transition: PENDING → end$/);
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('400 on ACTIVE:cancel', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'ACTIVE' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(400);
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });

  it('400 on CANCELLED:accept (terminal state)', async () => {
    authed();
    mocks.prisma.videoSession.findUnique.mockResolvedValue(
      existingRow({ userAId: OTHER_ID, userBId: SESSION_ID, status: 'CANCELLED' }),
    );
    const { PATCH } = await patchRoute();
    const res = await PATCH(
      new Request('http://test/api/video-sessions/x', {
        method: 'PATCH',
        body: JSON.stringify({ action: 'accept' }),
      }),
      { params: Promise.resolve({ id: SESSION_CUID }) } as never,
    );
    expect(res.status).toBe(400);
    expect(mocks.prisma.videoSession.update).not.toHaveBeenCalled();
  });
});
