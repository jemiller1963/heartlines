// @vitest-environment node
// @polsia:user-owned — Epic 5 Slice 1 structured profile compatibility tests.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    profile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const authOrResponse = vi.fn();
  return { prisma, authOrResponse };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/require-auth-result', () => ({ authOrResponse: mocks.authOrResponse }));

const SESSION_ID = 'heart-lines-member';
const NOW = new Date('2026-09-01T00:00:00.000Z');

const oldProfileRow = {
  id: 'profile-1',
  userId: SESSION_ID,
  displayName: 'A member',
  age: 68,
  location: 'Paris',
  interests: ['walking'],
  lifestylePreferences: [],
  bio: null,
  avatarUrl: null,
  verificationStatus: 'unverified' as const,
  createdAt: NOW,
  updatedAt: NOW,
};

function authed() {
  mocks.authOrResponse.mockResolvedValue({
    ok: true,
    session: { id: SESSION_ID, email: 'member@example.test' },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authOrResponse.mockReset();
  mocks.prisma.profile.findUnique.mockReset();
  mocks.prisma.profile.create.mockReset();
  mocks.prisma.profile.update.mockReset();
});

describe('structured profile contracts', () => {
  it('keeps legacy payloads valid when structured fields are omitted', async () => {
    const { ProfileCreate, ProfileItem } = await import('@/lib/contracts/profile');
    const legacy = {
      id: 'profile-1',
      userId: SESSION_ID,
      displayName: 'A member',
      age: 68,
      location: 'Paris',
      interests: ['walking'],
      lifestylePreferences: [],
      avatarUrl: null,
      verificationStatus: 'unverified',
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };

    expect(
      ProfileCreate.safeParse({
        age: legacy.age,
        location: legacy.location,
        interests: legacy.interests,
      }).success,
    ).toBe(true);
    const parsed = ProfileItem.parse(legacy);
    expect(parsed.relationshipIntent).toBeUndefined();
    expect(parsed.distancePreference).toBeUndefined();
    expect(parsed.lifestyleCharacteristics).toBeUndefined();
    expect(parsed.valuesPriorities).toBeUndefined();
    expect(parsed.partnerPreferences).toBeUndefined();
  });

  it('accepts the closed vocabulary and rejects unknown structured values', async () => {
    const { ProfileCreate } = await import('@/lib/contracts/profile');
    const valid = ProfileCreate.safeParse({
      age: 68,
      location: 'Paris',
      interests: ['walking'],
      relationshipIntent: 'companionship',
      distancePreference: 'nearby',
      lifestyleCharacteristics: ['active', 'traveler'],
      valuesPriorities: ['kindness', 'stability'],
      partnerPreferences: ['communication'],
    });
    expect(valid.success).toBe(true);

    expect(
      ProfileCreate.safeParse({
        age: 68,
        location: 'Paris',
        interests: ['walking'],
        relationshipIntent: 'anything',
      }).success,
    ).toBe(false);
    expect(
      ProfileCreate.safeParse({
        age: 68,
        location: 'Paris',
        interests: ['walking'],
        partnerPreferences: ['anything'],
      }).success,
    ).toBe(false);
  });
});

describe('/api/profile structured data mapping', () => {
  it('maps an old-shaped row to nullable and empty-default response fields', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(oldProfileRow);
    const { GET } = await import('@/app/api/profile/route');

    const response = await GET(new Request('http://test/api/profile'));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      relationshipIntent: null,
      distancePreference: null,
      lifestyleCharacteristics: [],
      valuesPriorities: [],
      partnerPreferences: [],
    });
  });

  it('persists both lifestyle fields independently while keeping owner scoping', async () => {
    authed();
    mocks.prisma.profile.findUnique.mockResolvedValue(oldProfileRow);
    mocks.prisma.profile.update.mockResolvedValue({
      ...oldProfileRow,
      lifestylePreferences: ['Pet-friendly', 'Quiet home'],
      relationshipIntent: 'long-term-partnership',
      distancePreference: 'within-50-miles',
      lifestyleCharacteristics: ['active'],
      valuesPriorities: ['honesty'],
      partnerPreferences: ['open-minded'],
    });
    const { PATCH } = await import('@/app/api/profile/route');

    const response = await PATCH(
      new Request('http://test/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          relationshipIntent: 'long-term-partnership',
          distancePreference: 'within-50-miles',
          lifestylePreferences: ['Pet-friendly', 'Quiet home'],
          lifestyleCharacteristics: ['active'],
          valuesPriorities: ['honesty'],
          partnerPreferences: ['open-minded'],
        }),
      }),
    );

    expect(response.status).toBe(200);
    const updateArgs = mocks.prisma.profile.update.mock.calls[0]?.[0] as {
      where: { userId: string };
      data: Record<string, unknown>;
    };
    expect(updateArgs.where).toEqual({ userId: SESSION_ID });
    expect(updateArgs.data).toMatchObject({
      relationshipIntent: 'long-term-partnership',
      distancePreference: 'within-50-miles',
      lifestylePreferences: ['Pet-friendly', 'Quiet home'],
      lifestyleCharacteristics: ['active'],
      valuesPriorities: ['honesty'],
      partnerPreferences: ['open-minded'],
    });
    const responseBody = await response.json();
    expect(responseBody.lifestylePreferences).toEqual(['Pet-friendly', 'Quiet home']);
    expect(responseBody.lifestyleCharacteristics).toEqual(['active']);
    expect(responseBody.partnerPreferences).toEqual(['open-minded']);
  });
});
