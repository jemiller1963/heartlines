// @vitest-environment node
// @polsia:user-owned — vitest for PATCH /api/admin/profiles/[id] +
// AdminProfileDecision contract.
//
// `vi.mock('server-only', () => ({}))` neutralizes the side-effect-only
// `server-only` import (this same trick is used by the GET contract test).
// `next/headers#headers()` is awaited inside `getSession`, so we stub it with
// an empty Headers bag plus a no-op cookies stub (`requireAdmin` may consult
// cookies; this handler doesn't, but stubbing it avoids surprises if more
// shared imports land). `auth.api.getSession` and `prisma.*` are hoisted so
// the `vi.mock('@/lib/auth')` / `vi.mock('@/lib/db')` factories can close
// over them.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

const mocks = vi.hoisted(() => {
  const getSession = vi.fn();
  const prisma = {
    profile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  };
  return { getSession, prisma };
});

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: mocks.getSession,
    },
  },
}));
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

const getRoute = () => import('@/app/api/admin/profiles/[id]/route');

// Real Request so `req.json()` works inside the handler (the handler parses
// the body with safeParse, so the request must carry valid JSON).
const makeRequest = (body: unknown) =>
  new Request('http://localhost/api/admin/profiles/profile-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.resetAllMocks();
});

// --- contract ----------------------------------------------------------------

describe('AdminProfileDecision contract', () => {
  it('accepts approve and flag actions', async () => {
    const { AdminProfileDecision } = await import('@/lib/contracts/admin');
    expect(AdminProfileDecision.safeParse({ action: 'approve' }).success).toBe(true);
    expect(AdminProfileDecision.safeParse({ action: 'flag' }).success).toBe(true);
  });

  it('rejects unknown actions and missing fields', async () => {
    const { AdminProfileDecision } = await import('@/lib/contracts/admin');
    expect(AdminProfileDecision.safeParse({ action: 'delete' }).success).toBe(false);
    expect(AdminProfileDecision.safeParse({}).success).toBe(false);
    expect(AdminProfileDecision.safeParse({ action: 'APPROVE' }).success).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

describe('PATCH /api/admin/profiles/[id]', () => {
  it('returns 401 Unauthorized when no session is present', async () => {
    mocks.getSession.mockResolvedValue(null);
    const { PATCH } = await getRoute();
    const res = await PATCH(makeRequest({ action: 'approve' }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.prisma.profile.update).not.toHaveBeenCalled();
  });

  it('returns 403 Forbidden when the caller is signed in but not an admin', async () => {
    // String literal `role: 'user'` avoids dragging in Prisma's role enum into
    // the test imports — the handler duck-types `!== 'admin'`.
    mocks.getSession.mockResolvedValue({ user: { id: 'viewer-user', role: 'user' } });
    const { PATCH } = await getRoute();
    const res = await PATCH(makeRequest({ action: 'approve' }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(mocks.prisma.profile.update).not.toHaveBeenCalled();
  });

  it('returns 400 with errors.action for an unknown action verb', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });
    const { PATCH } = await getRoute();
    const res = await PATCH(makeRequest({ action: 'delete' }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.action).toBeDefined();
    expect(mocks.prisma.profile.update).not.toHaveBeenCalled();
  });

  it('returns 400 with errors.action for a missing action', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });
    const { PATCH } = await getRoute();
    const res = await PATCH(makeRequest({}), {
      params: Promise.resolve({ id: 'profile-1' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.action).toBeDefined();
    expect(mocks.prisma.profile.update).not.toHaveBeenCalled();
  });

  it('returns 404 Not found when the profile id does not exist', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });
    mocks.prisma.profile.findUnique.mockResolvedValueOnce(null);
    const { PATCH } = await getRoute();
    const res = await PATCH(makeRequest({ action: 'approve' }), {
      params: Promise.resolve({ id: 'missing' }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
    expect(mocks.prisma.profile.update).not.toHaveBeenCalled();
  });

  it('returns 200 with reviewStatus=APPROVED on approve, hydrating displayName', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });

    const CREATED = new Date('2026-02-15T10:00:00.000Z');
    // Existence check returns the seeded row…
    mocks.prisma.profile.findUnique.mockResolvedValueOnce({ id: 'profile-1' });
    // …then update() fires…
    mocks.prisma.profile.update.mockResolvedValueOnce({ id: 'profile-1' });
    // …then the handler re-reads the post-mutation row. THIS is the value
    // that goes onto the wire — set its reviewStatus to APPROVED.
    mocks.prisma.profile.findUnique.mockResolvedValueOnce({
      id: 'profile-1',
      userId: 'user-1',
      age: 30,
      location: 'Paris',
      createdAt: CREATED,
      reviewStatus: 'APPROVED',
      avatarUrl: null,
    });
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ name: 'Alex' });

    const { PATCH } = await getRoute();
    const res = await PATCH(makeRequest({ action: 'approve' }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });

    expect(res.status).toBe(200);

    // Persisted with the right status — capture the call to prove the
    // mutation was issued exactly once with the expected shape.
    expect(mocks.prisma.profile.update).toHaveBeenCalledTimes(1);
    const updateArgs = mocks.prisma.profile.update.mock.calls[0]?.[0];
    expect(updateArgs?.where).toEqual({ id: 'profile-1' });
    expect(updateArgs?.data).toEqual({ reviewStatus: 'APPROVED' });

    const body = await res.json();
    // Round-trips the contract — if the response shape drifts, Zod throws here.
    const { AdminProfileListItem } = await import('@/lib/contracts/admin');
    const parsed = AdminProfileListItem.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.reviewStatus).toBe('APPROVED');
    expect(parsed.data?.displayName).toBe('Alex');
    expect(parsed.data?.city).toBe('Paris');
  });

  it('returns 200 with reviewStatus=FLAGGED on flag', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin-user', role: 'admin' } });

    const CREATED = new Date('2026-02-15T10:00:00.000Z');
    mocks.prisma.profile.findUnique.mockResolvedValueOnce({ id: 'profile-1' });
    mocks.prisma.profile.update.mockResolvedValueOnce({ id: 'profile-1' });
    mocks.prisma.profile.findUnique.mockResolvedValueOnce({
      id: 'profile-1',
      userId: 'user-1',
      age: 30,
      location: 'Paris',
      createdAt: CREATED,
      reviewStatus: 'FLAGGED',
      avatarUrl: null,
    });
    mocks.prisma.user.findUnique.mockResolvedValueOnce({ name: 'Alex' });

    const { PATCH } = await getRoute();
    const res = await PATCH(makeRequest({ action: 'flag' }), {
      params: Promise.resolve({ id: 'profile-1' }),
    });

    expect(res.status).toBe(200);
    const updateArgs = mocks.prisma.profile.update.mock.calls[0]?.[0];
    expect(updateArgs?.data).toEqual({ reviewStatus: 'FLAGGED' });

    const body = await res.json();
    const { AdminProfileListItem } = await import('@/lib/contracts/admin');
    const parsed = AdminProfileListItem.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.reviewStatus).toBe('FLAGGED');
  });
});
