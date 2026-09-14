// @vitest-environment node
// @polsia:user-owned — focused tests for the authenticated public profile
// serialization boundary.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  authOrResponse: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/require-auth-result', () => ({ authOrResponse: mocks.authOrResponse }));
vi.mock('@/lib/db', () => ({ prisma: { profile: { findUnique: mocks.findUnique } } }));

const VIEWER_ID = 'viewer-user';
const TARGET_ID = 'target-user';

const targetRow = {
  id: 'profile-id',
  userId: TARGET_ID,
  displayName: 'A member',
  age: 67,
  location: 'Paris',
  interests: ['books', 'walking'],
  lifestylePreferences: ['Quiet home'],
  bio: 'Enjoying the good conversations.',
  avatarUrl: '/uploads/avatar.jpg',
  verificationStatus: 'approved' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-02-01T00:00:00.000Z'),
  relationshipIntent: 'companionship',
  distancePreference: 'nearby',
  lifestyleCharacteristics: ['active'],
  valuesPriorities: ['kindness'],
  partnerPreferences: ['communication'],
  reviewStatus: 'PENDING',
};

function authed() {
  mocks.authOrResponse.mockResolvedValue({
    ok: true,
    session: { id: VIEWER_ID, email: 'viewer@example.test' },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authOrResponse.mockReset();
  mocks.findUnique.mockReset();
});

const getRoute = () => import('@/app/api/profile/[id]/route');

describe('public profile contract', () => {
  it('accepts exactly the established public shape', async () => {
    const { ProfilePublicItem } = await import('@/lib/contracts/profile-public');
    const parsed = ProfilePublicItem.safeParse({
      id: 'profile-id',
      userId: TARGET_ID,
      displayName: 'A member',
      age: 67,
      location: 'Paris',
      interests: ['books'],
      lifestylePreferences: ['Quiet home'],
      bio: null,
      avatarUrl: null,
      verificationStatus: 'approved',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });

    expect(parsed.success).toBe(true);
    expect(Object.keys(parsed.data ?? {}).sort()).toEqual([
      'age',
      'avatarUrl',
      'bio',
      'createdAt',
      'displayName',
      'id',
      'interests',
      'lifestylePreferences',
      'location',
      'updatedAt',
      'userId',
      'verificationStatus',
    ]);
  });

  it('rejects all matching-only and derived visibility fields', async () => {
    const { ProfilePublicItem } = await import('@/lib/contracts/profile-public');
    const publicItem = {
      id: 'profile-id',
      userId: TARGET_ID,
      displayName: null,
      age: 67,
      location: 'Paris',
      interests: [],
      lifestylePreferences: [],
      bio: null,
      avatarUrl: null,
      verificationStatus: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    };

    for (const field of [
      'relationshipIntent',
      'distancePreference',
      'lifestyleCharacteristics',
      'valuesPriorities',
      'partnerPreferences',
      'reviewStatus',
      'profilePublic',
      'canMessage',
    ]) {
      expect(ProfilePublicItem.safeParse({ ...publicItem, [field]: true }).success).toBe(false);
    }
  });
});

describe('GET /api/profile/[id]', () => {
  it('returns 401 before attempting the target lookup', async () => {
    mocks.authOrResponse.mockResolvedValue({ ok: false, res: new Response(null, { status: 401 }) });
    const { GET } = await getRoute();

    const response = await GET(new Request('http://test/api/profile/target'), {
      params: Promise.resolve({ id: TARGET_ID }),
    });

    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 only when the target profile row is missing', async () => {
    authed();
    mocks.findUnique.mockResolvedValue(null);
    const { GET } = await getRoute();

    const response = await GET(new Request('http://test/api/profile/target'), {
      params: Promise.resolve({ id: TARGET_ID }),
    });

    expect(response.status).toBe(404);
  });

  it('returns the explicit public whitelist without access-derived fields', async () => {
    authed();
    mocks.findUnique.mockResolvedValue(targetRow);
    const { GET } = await getRoute();

    const response = await GET(new Request('http://test/api/profile/target'), {
      params: Promise.resolve({ id: TARGET_ID }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      id: 'profile-id',
      userId: TARGET_ID,
      displayName: 'A member',
      age: 67,
      location: 'Paris',
      interests: ['books', 'walking'],
      lifestylePreferences: ['Quiet home'],
      bio: 'Enjoying the good conversations.',
      avatarUrl: '/uploads/avatar.jpg',
      verificationStatus: 'approved',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
    expect(mocks.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: TARGET_ID } }),
    );
  });
});
