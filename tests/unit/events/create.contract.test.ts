// @vitest-environment node
// @polsia:user-owned — vitest for POST /api/events + GET /api/events + the
// shared EventCreate / EventCreated / EventList contracts.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Mocks neutralise `@/lib/db` and `@/lib/require-auth` so the handler runs
// against a fake Prisma client; `vi.mock('server-only', () => ({}))` is
// enough to defuse the side-effect-only import.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('events create contracts', () => {
  it('EventCreate accepts the happy-path body', async () => {
    const { EventCreate } = await import('@/lib/contracts/events');
    expect(
      EventCreate.safeParse({
        title: 'Sunday brunch book club',
        hostName: 'Avery',
        startTime: '2026-09-12T15:00:00.000Z',
        city: 'Paris',
        maxAttendees: 10,
      }).success,
    ).toBe(true);
  });

  it('EventCreate rejects an empty title', async () => {
    const { EventCreate } = await import('@/lib/contracts/events');
    const r = EventCreate.safeParse({
      title: '',
      hostName: 'Avery',
      startTime: '2026-09-12T15:00:00.000Z',
      city: 'Paris',
      maxAttendees: 10,
    });
    expect(r.success).toBe(false);
  });

  it('EventCreate rejects a non-ISO startTime', async () => {
    const { EventCreate } = await import('@/lib/contracts/events');
    const r = EventCreate.safeParse({
      title: 'Sunday brunch book club',
      hostName: 'Avery',
      startTime: 'tomorrow',
      city: 'Paris',
      maxAttendees: 10,
    });
    expect(r.success).toBe(false);
  });

  it('EventCreate rejects maxAttendees: 0', async () => {
    const { EventCreate } = await import('@/lib/contracts/events');
    const r = EventCreate.safeParse({
      title: 'Sunday brunch book club',
      hostName: 'Avery',
      startTime: '2026-09-12T15:00:00.000Z',
      city: 'Paris',
      maxAttendees: 0,
    });
    expect(r.success).toBe(false);
  });

  it('EventCreate rejects maxAttendees: -1', async () => {
    const { EventCreate } = await import('@/lib/contracts/events');
    const r = EventCreate.safeParse({
      title: 'Sunday brunch book club',
      hostName: 'Avery',
      startTime: '2026-09-12T15:00:00.000Z',
      city: 'Paris',
      maxAttendees: -1,
    });
    expect(r.success).toBe(false);
  });

  it('EventCreated accepts a freshly-created row (attendeeCount: 0)', async () => {
    const { EventCreated } = await import('@/lib/contracts/events');
    expect(
      EventCreated.safeParse({
        id: `c${'a'.repeat(24)}`,
        title: 'Sunday brunch book club',
        hostName: 'Avery',
        startTime: '2026-09-12T15:00:00.000Z',
        city: 'Paris',
        attendeeCount: 0,
      }).success,
    ).toBe(true);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    event: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    eventRsvp: {
      groupBy: vi.fn(),
    },
  };
  const requireAuth = vi.fn();
  const email = { sendEmail: vi.fn().mockResolvedValue({ id: '' }) };
  return { prisma, requireAuth, email };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));
vi.mock('@/lib/email/send', () => ({ sendEmail: mocks.email.sendEmail }));

const SESSION_ID = 'viewer-user';
const BODY = {
  title: 'Sunday brunch book club',
  hostName: 'Avery',
  startTime: '2026-09-12T15:00:00.000Z',
  city: 'Paris',
  maxAttendees: 10,
};

function authed(id = SESSION_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.event.create.mockReset();
  mocks.prisma.event.findMany.mockReset();
  mocks.prisma.eventRsvp.groupBy.mockReset();
  mocks.requireAuth.mockReset();
  mocks.email.sendEmail.mockReset();
  mocks.email.sendEmail.mockResolvedValue({ id: '' });
});

const eventsRoute = () => import('@/app/api/events/route');

describe('POST /api/events — auth gate', () => {
  it('401 when requireAuth rejects; no Prisma calls', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { POST } = await eventsRoute();
    const res = await POST(
      new Request('http://test/api/events', { method: 'POST', body: JSON.stringify(BODY) }),
    );
    expect(res.status).toBe(401);
    expect(mocks.prisma.event.create).not.toHaveBeenCalled();
    expect(mocks.prisma.event.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.eventRsvp.groupBy).not.toHaveBeenCalled();
    expect(mocks.email.sendEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/events — input validation', () => {
  it('400 on empty body — no Prisma create call', async () => {
    authed();
    const { POST } = await eventsRoute();
    const res = await POST(new Request('http://test/api/events', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors).toBeDefined();
    for (const key of ['title', 'hostName', 'startTime', 'city', 'maxAttendees']) {
      expect(body.errors[key]).toBeTruthy();
    }
    expect(mocks.prisma.event.create).not.toHaveBeenCalled();
  });

  it('400 on partial body { title: "" } — only the title field error is surfaced', async () => {
    authed();
    const { POST } = await eventsRoute();
    const res = await POST(
      new Request('http://test/api/events', {
        method: 'POST',
        body: JSON.stringify({ title: '' }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.title).toBeTruthy();
    expect(mocks.prisma.event.create).not.toHaveBeenCalled();
    expect(mocks.email.sendEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/events — happy path', () => {
  it('201 returns EventCreated mapped from the inserted row', async () => {
    authed();
    const CREATED_ID = `c${'a'.repeat(24)}`;
    const CREATED_AT = new Date('2026-08-16T00:00:00.000Z');
    mocks.prisma.event.create.mockResolvedValue({
      id: CREATED_ID,
      userId: SESSION_ID,
      title: BODY.title,
      hostName: BODY.hostName,
      startTime: new Date(BODY.startTime),
      city: BODY.city,
      maxAttendees: BODY.maxAttendees,
      createdAt: CREATED_AT,
    });

    const { POST } = await eventsRoute();
    const res = await POST(
      new Request('http://test/api/events', { method: 'POST', body: JSON.stringify(BODY) }),
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBe(CREATED_ID);
    expect(body.title).toBe(BODY.title);
    expect(body.hostName).toBe(BODY.hostName);
    expect(body.startTime).toBe(new Date(BODY.startTime).toISOString());
    expect(body.city).toBe(BODY.city);
    expect(body.attendeeCount).toBe(0);

    // Ownership is sourced from session.id, NEVER from the body.
    const createArgs = mocks.prisma.event.create.mock.calls[0]?.[0] as {
      data: { userId: string; title: string };
    };
    expect(createArgs?.data?.userId).toBe(SESSION_ID);
    expect(createArgs?.data?.title).toBe(BODY.title);
  });

  it('201 triggers a host confirmation email via sendEmail (to: host email; subject mentions the event)', async () => {
    authed();
    const CREATED_ID = `c${'a'.repeat(24)}`;
    mocks.prisma.event.create.mockResolvedValue({
      id: CREATED_ID,
      userId: SESSION_ID,
      title: BODY.title,
      hostName: BODY.hostName,
      startTime: new Date(BODY.startTime),
      city: BODY.city,
      maxAttendees: BODY.maxAttendees,
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
    });

    const { POST } = await eventsRoute();
    await POST(
      new Request('http://test/api/events', { method: 'POST', body: JSON.stringify(BODY) }),
    );

    expect(mocks.email.sendEmail).toHaveBeenCalledTimes(1);
    const args = mocks.email.sendEmail.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
      text?: string;
    };
    expect(args.to).toBe('v@x');
    expect(args.subject).toContain('event');
    expect(args.subject).toContain(BODY.title);
    expect(args.html).toContain(BODY.title);
    expect(args.text).toContain('Heart Lines');
  });

  it('a failed sendEmail does NOT convert the 201 into a 5xx', async () => {
    authed();
    const CREATED_ID = `c${'a'.repeat(24)}`;
    mocks.prisma.event.create.mockResolvedValue({
      id: CREATED_ID,
      userId: SESSION_ID,
      title: BODY.title,
      hostName: BODY.hostName,
      startTime: new Date(BODY.startTime),
      city: BODY.city,
      maxAttendees: BODY.maxAttendees,
      createdAt: new Date('2026-08-16T00:00:00.000Z'),
    });
    mocks.email.sendEmail.mockRejectedValueOnce(new Error('proxy down'));

    const { POST } = await eventsRoute();
    const res = await POST(
      new Request('http://test/api/events', { method: 'POST', body: JSON.stringify(BODY) }),
    );
    expect(res.status).toBe(201);
  });
});

// --- GET /api/events ---------------------------------------------------------

describe('GET /api/events — auth + listing', () => {
  it('401 when requireAuth rejects; no Prisma calls', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { GET } = await eventsRoute();
    const res = await GET(new Request('http://test/api/events', { method: 'GET' }));
    expect(res.status).toBe(401);
    expect(mocks.prisma.event.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.eventRsvp.groupBy).not.toHaveBeenCalled();
  });

  it('200 returns an empty envelope when no events exist (groupBy is NOT called)', async () => {
    authed();
    mocks.prisma.event.findMany.mockResolvedValue([]);

    const { GET } = await eventsRoute();
    const res = await GET(new Request('http://test/api/events', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [], nextCursor: null });
    expect(mocks.prisma.eventRsvp.groupBy).not.toHaveBeenCalled();
  });

  it('200 returns a populated list with attendeeCount merged from a single groupBy', async () => {
    authed();
    const ID_A = `c${'a'.repeat(24)}`;
    const ID_B = `c${'b'.repeat(24)}`;
    mocks.prisma.event.findMany.mockResolvedValue([
      {
        id: ID_A,
        userId: 'anyone',
        title: 'Brunch',
        hostName: 'Avery',
        startTime: new Date('2026-09-01T10:00:00.000Z'),
        city: 'Paris',
        maxAttendees: 10,
        createdAt: new Date('2026-08-15T00:00:00.000Z'),
      },
      {
        id: ID_B,
        userId: 'someone',
        title: 'Hike',
        hostName: 'Bailey',
        startTime: new Date('2026-09-05T08:00:00.000Z'),
        city: 'Lyon',
        maxAttendees: 6,
        createdAt: new Date('2026-08-15T00:00:00.000Z'),
      },
    ]);
    mocks.prisma.eventRsvp.groupBy.mockResolvedValue([
      { eventId: ID_A, _count: { _all: 3 } },
      { eventId: ID_B, _count: { _all: 1 } },
    ]);

    const { GET } = await eventsRoute();
    const res = await GET(new Request('http://test/api/events', { method: 'GET' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: ID_A,
      title: 'Brunch',
      attendeeCount: 3,
    });
    expect(body.items[1]).toMatchObject({
      id: ID_B,
      title: 'Hike',
      attendeeCount: 1,
    });

    // Two events in -> a single batched groupBy call (no per-row N+1).
    expect(mocks.prisma.event.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.eventRsvp.groupBy).toHaveBeenCalledTimes(1);
    const groupByArgs = mocks.prisma.eventRsvp.groupBy.mock.calls[0]?.[0] as {
      where?: { eventId?: { in?: string[] } };
    };
    expect(groupByArgs?.where?.eventId?.in).toEqual([ID_A, ID_B]);
  });

  it('200 fills missing attendeeCount with 0 when an event has no RSVPs', async () => {
    authed();
    const ID_SOLO = `c${'c'.repeat(24)}`;
    mocks.prisma.event.findMany.mockResolvedValue([
      {
        id: ID_SOLO,
        userId: 'anyone',
        title: 'Solo',
        hostName: 'Avery',
        startTime: new Date('2026-09-01T10:00:00.000Z'),
        city: 'Paris',
        maxAttendees: 10,
        createdAt: new Date('2026-08-15T00:00:00.000Z'),
      },
    ]);
    // groupBy returns no rows — the find set has no RSVPs yet.
    mocks.prisma.eventRsvp.groupBy.mockResolvedValue([]);

    const { GET } = await eventsRoute();
    const res = await GET(new Request('http://test/api/events', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].attendeeCount).toBe(0);
  });
});
