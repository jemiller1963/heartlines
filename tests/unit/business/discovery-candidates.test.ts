// @vitest-environment node
// @polsia:user-owned — canonical discovery candidate-pool regression suite.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => {
  const prisma = {
    profile: { findMany: vi.fn() },
    swipe: { findMany: vi.fn() },
    block: { findMany: vi.fn() },
    privacyPreferences: { findMany: vi.fn() },
    discovery: { findMany: vi.fn() },
    connection: { findMany: vi.fn() },
  };
  return { prisma };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

const VIEWER_USER = 'viewer-user';
const OUTGOING_BLOCK = 'outgoing-block';
const INCOMING_BLOCK = 'incoming-block';
const PRIVATE_USER = 'private-user';
const ACCEPTED_USER = 'accepted-user';
const REJECTED_USER = 'rejected-user';
const RECENTLY_SEEN_USER = 'recently-seen-user';
const OLD_SEEN_USER = 'old-seen-user';
const NON_SEEN_DISCOVERY_USER = 'non-seen-discovery-user';
const OUTGOING_CONNECTION_USER = 'outgoing-connection-user';
const INCOMING_CONNECTION_USER = 'incoming-connection-user';

type ReviewStatus = 'APPROVED' | 'PENDING' | 'FLAGGED';

function profileRow(
  suffix: string,
  userId: string,
  age = 52,
  reviewStatus: ReviewStatus = 'APPROVED',
) {
  return {
    id: `c${suffix.padStart(24, '0')}`,
    userId,
    age,
    location: 'Paris',
    interests: ['hiking'],
    lifestylePreferences: [],
    bio: null,
    avatarUrl: null,
    verificationStatus: 'unverified',
    reviewStatus,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function useDatabaseFiltering(rows: ReturnType<typeof profileRow>[]) {
  const captured = vi.fn();
  mocks.prisma.profile.findMany.mockImplementation((args) => {
    captured(args);
    const where = args?.where ?? {};
    const minimumAge = where.age?.gte ?? Number.NEGATIVE_INFINITY;
    const excluded = where.userId?.notIn ?? [];
    const cursor = where.id?.gt;
    return Promise.resolve(
      rows.filter(
        (row) =>
          row.age >= minimumAge &&
          row.reviewStatus === where.reviewStatus &&
          !excluded.includes(row.userId) &&
          (!cursor || row.id > cursor),
      ),
    );
  });
  return captured;
}

function getCandidates(options: {
  cursor?: string;
  limit?: number;
}) {
  return import('@/lib/business/discovery-candidates').then(
    ({ getEligibleDiscoveryCandidates }) =>
      getEligibleDiscoveryCandidates({
        viewerUserId: VIEWER_USER,
        cursor: options.cursor,
        limit: options.limit ?? 40,
      }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.block.findMany.mockResolvedValue([]);
  mocks.prisma.privacyPreferences.findMany.mockResolvedValue([]);
  mocks.prisma.swipe.findMany.mockResolvedValue([]);
  mocks.prisma.discovery.findMany.mockResolvedValue([]);
  mocks.prisma.connection.findMany.mockResolvedValue([]);
  mocks.prisma.profile.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getEligibleDiscoveryCandidates — hard eligibility', () => {
  it('keeps age 50, excludes age 49, and queries only APPROVED profiles', async () => {
    const captured = useDatabaseFiltering([
      profileRow('under', 'under-age', 49),
      profileRow('boundary', 'boundary-age', 50),
      profileRow('pending', 'pending-user', 60, 'PENDING'),
      profileRow('flagged', 'flagged-user', 60, 'FLAGGED'),
    ]);

    const candidates = await getCandidates({});

    expect(candidates.map((row) => row.userId)).toEqual(['boundary-age']);
    const where = captured.mock.calls[0]?.[0]?.where;
    expect(where?.age).toEqual({ gte: 50 });
    expect(where?.reviewStatus).toBe('APPROVED');
  });

  it('applies the cursor, ascending id order, and fetch limit in the database query', async () => {
    const captured = vi.fn().mockResolvedValue([]);
    mocks.prisma.profile.findMany.mockImplementation(captured);
    const cursor = `c${'m'.repeat(24)}`;

    await getCandidates({ cursor, limit: 17 });

    const args = captured.mock.calls[0]?.[0];
    expect(args?.where?.id).toEqual({ gt: cursor });
    expect(args?.orderBy).toEqual({ id: 'asc' });
    expect(args?.take).toBe(17);
  });
});

describe('getEligibleDiscoveryCandidates — safety exclusions', () => {
  it('combines self, both block directions, private profiles, and both swipe decisions', async () => {
    mocks.prisma.block.findMany
      .mockResolvedValueOnce([{ blockedId: OUTGOING_BLOCK }])
      .mockResolvedValueOnce([{ blockerId: INCOMING_BLOCK }]);
    mocks.prisma.privacyPreferences.findMany.mockResolvedValue([{ userId: PRIVATE_USER }]);
    mocks.prisma.swipe.findMany.mockResolvedValue([
      { toUserId: ACCEPTED_USER },
      { toUserId: REJECTED_USER },
    ]);
    const captured = useDatabaseFiltering([
      profileRow('self', VIEWER_USER),
      profileRow('outgoing', OUTGOING_BLOCK),
      profileRow('incoming', INCOMING_BLOCK),
      profileRow('private', PRIVATE_USER),
      profileRow('accepted', ACCEPTED_USER),
      profileRow('rejected', REJECTED_USER),
      profileRow('clean', 'clean-user'),
    ]);

    const candidates = await getCandidates({});

    expect(candidates.map((row) => row.userId)).toEqual(['clean-user']);
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toEqual(
      expect.arrayContaining([
        VIEWER_USER,
        OUTGOING_BLOCK,
        INCOMING_BLOCK,
        PRIVATE_USER,
        ACCEPTED_USER,
        REJECTED_USER,
      ]),
    );
    expect(mocks.prisma.swipe.findMany).toHaveBeenCalledWith({
      where: { fromUserId: VIEWER_USER },
      select: { toUserId: true },
    });
  });

  it('leaves a clean public candidate eligible when no safety rule matches', async () => {
    const clean = profileRow('clean', 'clean-user');
    useDatabaseFiltering([clean]);

    const candidates = await getCandidates({});

    expect(candidates).toEqual([clean]);
  });
});

describe('getEligibleDiscoveryCandidates — recent seen exclusions', () => {
  it('always excludes recent seen rows, while older and non-seen rows re-qualify', async () => {
    const now = new Date('2026-08-26T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const recentSeenAt = new Date('2026-08-20T12:00:00.000Z');
    const oldSeenAt = new Date('2026-07-20T12:00:00.000Z');
    const seenRows = [
      {
        viewerUserId: VIEWER_USER,
        targetUserId: RECENTLY_SEEN_USER,
        status: 'seen',
        seenAt: recentSeenAt,
      },
      { viewerUserId: VIEWER_USER, targetUserId: OLD_SEEN_USER, status: 'seen', seenAt: oldSeenAt },
      {
        viewerUserId: VIEWER_USER,
        targetUserId: NON_SEEN_DISCOVERY_USER,
        status: 'connected',
        seenAt: recentSeenAt,
      },
    ];
    mocks.prisma.discovery.findMany.mockImplementation((args) => {
      const where = args?.where;
      const cutoff = where?.seenAt?.gte;
      return Promise.resolve(
        seenRows
          .filter(
            (row) =>
              row.viewerUserId === where?.viewerUserId &&
              row.status === where?.status &&
              (!cutoff || row.seenAt >= cutoff),
          )
          .map(({ targetUserId }) => ({ targetUserId })),
      );
    });
    const captured = useDatabaseFiltering([
      profileRow('recent', RECENTLY_SEEN_USER),
      profileRow('old', OLD_SEEN_USER),
      profileRow('non-seen', NON_SEEN_DISCOVERY_USER),
      profileRow('clean', 'clean-user'),
    ]);

    const candidates = await getCandidates({});

    expect(candidates.map((row) => row.userId)).toEqual([
      OLD_SEEN_USER,
      NON_SEEN_DISCOVERY_USER,
      'clean-user',
    ]);
    const discoveryArgs = mocks.prisma.discovery.findMany.mock.calls[0]?.[0];
    expect(discoveryArgs?.where?.viewerUserId).toBe(VIEWER_USER);
    expect(discoveryArgs?.where?.status).toBe('seen');
    expect(discoveryArgs?.where?.seenAt?.gte).toEqual(
      new Date(now.getTime() - 30 * 86_400_000),
    );
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain(RECENTLY_SEEN_USER);
    expect(notIn).not.toContain(OLD_SEEN_USER);
  });

  it('uses only outgoing Connection targets and leaves incoming connections eligible', async () => {
    mocks.prisma.connection.findMany.mockResolvedValue([
      { toUserId: OUTGOING_CONNECTION_USER },
    ]);
    const captured = useDatabaseFiltering([
      profileRow('outgoing', OUTGOING_CONNECTION_USER),
      profileRow('incoming', INCOMING_CONNECTION_USER),
      profileRow('clean', 'clean-user'),
    ]);

    const candidates = await getCandidates({});

    expect(candidates.map((row) => row.userId)).toEqual([
      INCOMING_CONNECTION_USER,
      'clean-user',
    ]);
    expect(mocks.prisma.connection.findMany).toHaveBeenCalledWith({
      where: { fromUserId: VIEWER_USER },
      select: { toUserId: true },
    });
    const notIn: string[] = captured.mock.calls[0]?.[0]?.where?.userId?.notIn ?? [];
    expect(notIn).toContain(OUTGOING_CONNECTION_USER);
    expect(notIn).not.toContain(INCOMING_CONNECTION_USER);
  });
});
