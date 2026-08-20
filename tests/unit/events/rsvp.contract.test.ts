// @polsia:user-owned — vitest for POST /api/events/[id]/rsvp and the
// EventRsvpResult contract.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
//
// Mirrors `tests/unit/video-sessions/contract.test.ts` in shape —
// `vi.mock('server-only', () => ({}))` neutralises the side-effect-only
// import; the hoisted mock block stubs `@/lib/db` and `@/lib/require-auth`
// so the route handler can run without a real Prisma client.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('events contract', () => {
  it('EventRsvpResult accepts a well-formed row', async () => {
    const { EventRsvpResult } = await import('@/lib/contracts/events');
    expect(
      EventRsvpResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        eventId: 'evt-1',
        userId: 'user-a',
        createdAt: '2026-08-10T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('EventRsvpResult rejects a non-cuid id', async () => {
    const { EventRsvpResult } = await import('@/lib/contracts/events');
    expect(
      EventRsvpResult.safeParse({
        id: 'not-a-cuid',
        eventId: 'evt-1',
        userId: 'user-a',
        createdAt: '2026-08-10T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('EventRsvpResult rejects a missing eventId', async () => {
    const { EventRsvpResult } = await import('@/lib/contracts/events');
    expect(
      EventRsvpResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        eventId: '',
        userId: 'user-a',
        createdAt: '2026-08-10T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('EventRsvpResult rejects a non-ISO createdAt', async () => {
    const { EventRsvpResult } = await import('@/lib/contracts/events');
    expect(
      EventRsvpResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        eventId: 'evt-1',
        userId: 'user-a',
        createdAt: 'yesterday',
      }).success,
    ).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    eventRsvp: { upsert: vi.fn() },
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
const EVENT_ID = 'evt-1';

function rsvpRow(args: { id: string; eventId: string; userId: string; createdAt: Date }) {
  return {
    id: args.id,
    eventId: args.eventId,
    userId: args.userId,
    createdAt: args.createdAt,
  };
}

function authed(id = SESSION_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.eventRsvp.upsert.mockReset();
  mocks.requireAuth.mockReset();
});

const rsvpRoute = () => import('@/app/api/events/[id]/rsvp/route');

describe('POST /api/events/[id]/rsvp — auth + validation gates', () => {
  it('401 when requireAuth rejects (no upsert call)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { POST } = await rsvpRoute();
    const res = await POST(
      new Request(`http://test/api/events/${EVENT_ID}/rsvp`, { method: 'POST' }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(res.status).toBe(401);
    expect(mocks.prisma.eventRsvp.upsert).not.toHaveBeenCalled();
  });

  it('400 when path id is empty after trim (no upsert call)', async () => {
    authed();
    const { POST } = await rsvpRoute();
    const res = await POST(new Request('http://test/api/events/%20%20/rsvp', { method: 'POST' }), {
      params: Promise.resolve({ id: '   ' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Missing event id');
    expect(mocks.prisma.eventRsvp.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/events/[id]/rsvp — happy path', () => {
  it('200 with the upserted row contents (create path)', async () => {
    authed();
    const NOW = new Date('2026-08-10T00:00:00.000Z');
    mocks.prisma.eventRsvp.upsert.mockResolvedValue(
      rsvpRow({ id: `c${'a'.repeat(24)}`, eventId: EVENT_ID, userId: SESSION_ID, createdAt: NOW }),
    );

    const { POST } = await rsvpRoute();
    const res = await POST(
      new Request(`http://test/api/events/${EVENT_ID}/rsvp`, { method: 'POST' }),
      {
        params: Promise.resolve({ id: EVENT_ID }),
      },
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(`c${'a'.repeat(24)}`);
    expect(body.eventId).toBe(EVENT_ID);
    expect(body.userId).toBe(SESSION_ID);
    expect(body.createdAt).toBe(NOW.toISOString());

    expect(mocks.prisma.eventRsvp.upsert).toHaveBeenCalledTimes(1);
    const args = mocks.prisma.eventRsvp.upsert.mock.calls[0]?.[0] as {
      where: { eventId_userId: { eventId: string; userId: string } };
      create: { eventId: string; userId: string };
      update: Record<string, never>;
    };
    expect(args.where.eventId_userId).toEqual({ eventId: EVENT_ID, userId: SESSION_ID });
    expect(args.create).toEqual({ eventId: EVENT_ID, userId: SESSION_ID });
    expect(args.update).toEqual({});
  });

  it('trims whitespace from the path id before upsert', async () => {
    authed();
    const NOW = new Date('2026-08-10T00:00:00.000Z');
    mocks.prisma.eventRsvp.upsert.mockResolvedValue(
      rsvpRow({
        id: `c${'b'.repeat(24)}`,
        eventId: 'evt-trimmed',
        userId: SESSION_ID,
        createdAt: NOW,
      }),
    );

    const { POST } = await rsvpRoute();
    const res = await POST(
      new Request('http://test/api/events/evt-trimmed/rsvp', { method: 'POST' }),
      { params: Promise.resolve({ id: '  evt-trimmed  ' }) },
    );
    expect(res.status).toBe(200);

    const args = mocks.prisma.eventRsvp.upsert.mock.calls[0]?.[0] as {
      where: { eventId_userId: { eventId: string; userId: string } };
    };
    expect(args.where.eventId_userId).toEqual({ eventId: 'evt-trimmed', userId: SESSION_ID });
  });
});

describe('POST /api/events/[id]/rsvp — idempotent duplicate', () => {
  it('200 on a SECOND identical POST — returns the ORIGINAL row, evicts `create`, hits `update: {}`', async () => {
    authed();

    // First POST — the upsert finds no prior row, so Prisma follows the
    // `create` branch. We return a stable row that the SECOND POST will
    // also see (Prisma re-runs the upsert but lands on `update: {}`).
    const ORIGINAL_ID = `c${'a'.repeat(24)}`;
    const ORIGINAL_AT = new Date('2026-08-10T00:00:00.000Z');
    const original = rsvpRow({
      id: ORIGINAL_ID,
      eventId: EVENT_ID,
      userId: SESSION_ID,
      createdAt: ORIGINAL_AT,
    });
    mocks.prisma.eventRsvp.upsert.mockResolvedValue(original);

    const { POST } = await rsvpRoute();
    const first = await POST(
      new Request(`http://test/api/events/${EVENT_ID}/rsvp`, { method: 'POST' }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(first.status).toBe(200);

    // Second POST — Prisma's upsert is called again (the route does NOT
    // short-circuit on the previous OK). Both calls share the SAME mock
    // return value — Prisma's `update: {}` keeps the existing row id /
    // createdAt intact, so the response body is identical.
    const second = await POST(
      new Request(`http://test/api/events/${EVENT_ID}/rsvp`, { method: 'POST' }),
      { params: Promise.resolve({ id: EVENT_ID }) },
    );
    expect(second.status).toBe(200);

    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.createdAt).toBe(firstBody.createdAt);
    expect(secondBody.eventId).toBe(firstBody.eventId);
    expect(secondBody.userId).toBe(firstBody.userId);

    // Both calls invoked the upsert with the SAME composite key + `update:
    // {}` (the idempotency path lands on `update: {}`, never `create`).
    expect(mocks.prisma.eventRsvp.upsert).toHaveBeenCalledTimes(2);
    for (const call of mocks.prisma.eventRsvp.upsert.mock.calls) {
      const args = call[0] as {
        where: { eventId_userId: { eventId: string; userId: string } };
        update: Record<string, never>;
      };
      expect(args.where.eventId_userId).toEqual({ eventId: EVENT_ID, userId: SESSION_ID });
      expect(args.update).toEqual({});
    }
  });
});
