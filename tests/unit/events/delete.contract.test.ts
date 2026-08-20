// @vitest-environment node
// @polsia:user-owned — vitest for DELETE /api/events/[id] and the host-only
// cancel flow. Mirrors `tests/unit/events/rsvp.contract.test.ts` in shape:
// `vi.mock('server-only', () => ({}))` neutralises the side-effect-only
// import; the hoisted mock block stubs `@/lib/db` and `@/lib/require-auth`
// so the route handler can run without a real Prisma client.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    event: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
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
const OTHER_ID = 'someone-else';
const EVENT_ID = 'evt-1';

function authed(id: string) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.event.findUnique.mockReset();
  mocks.prisma.event.delete.mockReset();
  mocks.requireAuth.mockReset();
});

const eventsIdRoute = () => import('@/app/api/events/[id]/route');

function callDelete(idParam: string) {
  return (async () => {
    const { DELETE } = await eventsIdRoute();
    return DELETE(new Request(`http://test/api/events/${idParam}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: idParam }),
    });
  })();
}

describe('DELETE /api/events/[id] — auth gate', () => {
  it('401 when requireAuth rejects; no Prisma calls', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const res = await callDelete(EVENT_ID);
    expect(res.status).toBe(401);
    expect(mocks.prisma.event.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.event.delete).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/events/[id] — input gate', () => {
  it('400 when path id is empty after trim (no Prisma calls)', async () => {
    authed(SESSION_ID);
    const res = await callDelete('   ');
    expect(res.status).toBe(400);
    expect(mocks.prisma.event.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.event.delete).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/events/[id] — host equality gate', () => {
  it('403 when the authed user is not the host (no delete call)', async () => {
    authed(OTHER_ID);
    mocks.prisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID,
      userId: SESSION_ID,
    });

    const res = await callDelete(EVENT_ID);
    expect(res.status).toBe(403);
    expect(mocks.prisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.event.delete).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/events/[id] — missing event', () => {
  it('404 when findUnique returns null (no delete call)', async () => {
    authed(SESSION_ID);
    mocks.prisma.event.findUnique.mockResolvedValue(null);

    const res = await callDelete(EVENT_ID);
    expect(res.status).toBe(404);
    expect(mocks.prisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.event.delete).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/events/[id] — happy path', () => {
  it('204 when the authed user IS the host; prisma.event.delete called with the id', async () => {
    authed(SESSION_ID);
    mocks.prisma.event.findUnique.mockResolvedValue({
      id: EVENT_ID,
      userId: SESSION_ID,
    });
    mocks.prisma.event.delete.mockResolvedValue({ id: EVENT_ID });

    const res = await callDelete(EVENT_ID);
    expect(res.status).toBe(204);
    // 204 has no body by spec.
    expect(await res.text()).toBe('');

    expect(mocks.prisma.event.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.event.delete).toHaveBeenCalledTimes(1);
    const delArgs = mocks.prisma.event.delete.mock.calls[0]?.[0] as { where: { id: string } };
    expect(delArgs.where.id).toBe(EVENT_ID);
  });

  it('trims whitespace from the path id before lookup and delete', async () => {
    authed(SESSION_ID);
    mocks.prisma.event.findUnique.mockResolvedValue({
      id: 'evt-trimmed',
      userId: SESSION_ID,
    });
    mocks.prisma.event.delete.mockResolvedValue({ id: 'evt-trimmed' });

    const res = await callDelete('  evt-trimmed  ');
    expect(res.status).toBe(204);

    const findArgs = mocks.prisma.event.findUnique.mock.calls[0]?.[0] as { where: { id: string } };
    expect(findArgs.where.id).toBe('evt-trimmed');
    const delArgs = mocks.prisma.event.delete.mock.calls[0]?.[0] as { where: { id: string } };
    expect(delArgs.where.id).toBe('evt-trimmed');
  });
});
