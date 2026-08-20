// @vitest-environment node
// @polsia:user-owned — vitest for GET /api/events/[id] and the EventDetail
// contract. Mirrors `tests/unit/events/delete.contract.test.ts` in shape:
// `vi.mock('server-only', () => ({}))` neutralises the side-effect-only
// import; the hoisted mock block stubs `@/lib/db` and `@/lib/require-auth`
// so the route handler can run without a real Prisma client.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('events detail contracts', () => {
  it('EventDetail accepts a fully populated row', async () => {
    const { EventDetail } = await import('@/lib/contracts/events');
    expect(
      EventDetail.safeParse({
        id: `c${'a'.repeat(24)}`,
        hostId: 'host-1',
        title: 'Sunday brunch book club',
        hostName: 'Avery',
        startTime: '2026-09-12T15:00:00.000Z',
        city: 'Paris',
        maxAttendees: 10,
        currentAttendees: 3,
      }).success,
    ).toBe(true);
  });

  it('EventDetail rejects a missing currentAttendees', async () => {
    const { EventDetail } = await import('@/lib/contracts/events');
    const r = EventDetail.safeParse({
      id: `c${'a'.repeat(24)}`,
      hostId: 'host-1',
      title: 'Sunday brunch book club',
      hostName: 'Avery',
      startTime: '2026-09-12T15:00:00.000Z',
      city: 'Paris',
      maxAttendees: 10,
    });
    expect(r.success).toBe(false);
  });

  it('EventDetail rejects a negative currentAttendees', async () => {
    const { EventDetail } = await import('@/lib/contracts/events');
    const r = EventDetail.safeParse({
      id: `c${'a'.repeat(24)}`,
      hostId: 'host-1',
      title: 'Sunday brunch book club',
      hostName: 'Avery',
      startTime: '2026-09-12T15:00:00.000Z',
      city: 'Paris',
      maxAttendees: 10,
      currentAttendees: -1,
    });
    expect(r.success).toBe(false);
  });

  it('EventDetail rejects a non-ISO startTime', async () => {
    const { EventDetail } = await import('@/lib/contracts/events');
    const r = EventDetail.safeParse({
      id: `c${'a'.repeat(24)}`,
      hostId: 'host-1',
      title: 'Sunday brunch book club',
      hostName: 'Avery',
      startTime: 'tomorrow',
      city: 'Paris',
      maxAttendees: 10,
      currentAttendees: 0,
    });
    expect(r.success).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    event: { findUnique: vi.fn() },
    eventRsvp: { count: vi.fn() },
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
const HOST_ID = 'host-actual';
const EVENT_ID = 'evt-1';

function authed(id = SESSION_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.event.findUnique.mockReset();
  mocks.prisma.eventRsvp.count.mockReset();
  mocks.requireAuth.mockReset();
});

const eventsIdRoute = () => import('@/app/api/events/[id]/route');

function callGet(idParam: string) {
  return (async () => {
    const { GET } = await eventsIdRoute();
    return GET(new Request(`http://test/api/events/${idParam}`, { method: 'GET' }), {
      params: Promise.resolve({ id: idParam }),
    });
  })();
}

describe('GET /api/events/[id] — auth gate', () => {
  it('401 when requireAuth rejects; no Prisma calls', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const res = await callGet(EVENT_ID);
    expect(res.status).toBe(401);
    expect(mocks.prisma.event.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.eventRsvp.count).not.toHaveBeenCalled();
  });
});

describe('GET /api/events/[id] — input gate', () => {
  it('400 when path id is empty after trim (no Prisma calls)', async () => {
    authed();
    const res = await callGet('   ');
    expect(res.status).toBe(400);
    expect(mocks.prisma.event.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.eventRsvp.count).not.toHaveBeenCalled();
  });
});

describe('GET /api/events/[id] — missing event', () => {
  it('404 when findUnique returns null; no count call', async () => {
    authed();
    mocks.prisma.event.findUnique.mockResolvedValue(null);

    const res = await callGet(EVENT_ID);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
    expect(mocks.prisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.eventRsvp.count).not.toHaveBeenCalled();
  });
});

describe('GET /api/events/[id] — happy path', () => {
  it('200 returns an EventDetail-shaped body sourced from the row + RSVP count', async () => {
    authed();
    const START_TIME = new Date('2026-09-12T15:00:00.000Z');
    mocks.prisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID,
      userId: HOST_ID,
      title: 'Sunday brunch book club',
      hostName: 'Avery',
      startTime: START_TIME,
      city: 'Paris',
      maxAttendees: 10,
    });
    mocks.prisma.eventRsvp.count.mockResolvedValue(4);

    const res = await callGet(EVENT_ID);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      id: EVENT_ID,
      hostId: HOST_ID,
      title: 'Sunday brunch book club',
      hostName: 'Avery',
      startTime: START_TIME.toISOString(),
      city: 'Paris',
      maxAttendees: 10,
      currentAttendees: 4,
    });

    expect(mocks.prisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.eventRsvp.count).toHaveBeenCalledTimes(1);
    const countArgs = mocks.prisma.eventRsvp.count.mock.calls[0]?.[0] as {
      where: { eventId: string };
    };
    expect(countArgs.where.eventId).toBe(EVENT_ID);
  });

  it('hostId in the response is sourced from event.userId, NOT session.id', async () => {
    authed();
    mocks.prisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID,
      userId: HOST_ID,
      title: 'Brunch',
      hostName: 'Avery',
      startTime: new Date('2026-09-12T15:00:00.000Z'),
      city: 'Paris',
      maxAttendees: 10,
    });
    mocks.prisma.eventRsvp.count.mockResolvedValue(0);

    const res = await callGet(EVENT_ID);
    const body = await res.json();
    expect(body.hostId).toBe(HOST_ID);
    expect(body.hostId).not.toBe(SESSION_ID);
  });

  it('200 with currentAttendees: 0 when no RSVPs have been recorded', async () => {
    authed();
    mocks.prisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID,
      userId: HOST_ID,
      title: 'Brunch',
      hostName: 'Avery',
      startTime: new Date('2026-09-12T15:00:00.000Z'),
      city: 'Paris',
      maxAttendees: 6,
    });
    mocks.prisma.eventRsvp.count.mockResolvedValue(0);

    const res = await callGet(EVENT_ID);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentAttendees).toBe(0);
    expect(body.maxAttendees).toBe(6);
  });

  it('trims whitespace from the path id before lookup and count', async () => {
    authed();
    mocks.prisma.event.findUnique.mockResolvedValue({
      id: 'evt-trimmed',
      userId: HOST_ID,
      title: 'Brunch',
      hostName: 'Avery',
      startTime: new Date('2026-09-12T15:00:00.000Z'),
      city: 'Paris',
      maxAttendees: 10,
    });
    mocks.prisma.eventRsvp.count.mockResolvedValue(0);

    const res = await callGet('  evt-trimmed  ');
    expect(res.status).toBe(200);

    const findArgs = mocks.prisma.event.findUnique.mock.calls[0]?.[0] as { where: { id: string } };
    expect(findArgs.where.id).toBe('evt-trimmed');
    const countArgs = mocks.prisma.eventRsvp.count.mock.calls[0]?.[0] as {
      where: { eventId: string };
    };
    expect(countArgs.where.eventId).toBe('evt-trimmed');
  });
});
