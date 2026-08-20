// @polsia:user-owned — matching-feed Discover API: ranked potential matches.
//
// requireAuth gates access. Returns one page of scored profiles, excluding
// the viewer, anyone they've already swiped on, and anyone whose Discovery
// row marks them as 'seen' within the last 30 days. Score uses
// scoreMatch(viewer, candidate). Cursor = last profile.id; ordering = score
// DESC, profile.id ASC for stable pagination. Empty result returns 200 with
// { matches: [], nextCursor: null } — never 404.

import 'server-only';
import { NextResponse } from 'next/server';
import { interestOverlap } from '@/lib/business/matching';
import { type DiscoverMatchItem, DiscoverQuery, DiscoverResult } from '@/lib/contracts/discover';
import { ProfileItem } from '@/lib/contracts/profile';
import { prisma } from '@/lib/db';
import { scoreMatch } from '@/lib/matching/compatibility';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;
const CANDIDATE_FETCH = PAGE_SIZE * 4;
const SEEN_WINDOW_MS = 30 * 86_400_000;

function profileShape(row: {
  id: string;
  userId: string;
  age: number;
  location: string;
  interests: string[];
  bio: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return ProfileItem.parse({
    id: row.id,
    userId: row.userId,
    age: row.age,
    location: row.location,
    interests: row.interests,
    bio: row.bio ?? undefined,
    avatarUrl: row.avatarUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const query = DiscoverQuery.safeParse({
    cursor: url.searchParams.get('cursor') ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json(
      { errors: { cursor: query.error.issues[0]?.message ?? 'Invalid cursor' } },
      { status: 400 },
    );
  }

  const viewerProfile = await prisma.profile.findUnique({
    where: { userId: auth.session.id },
  });
  if (!viewerProfile) {
    return NextResponse.json(
      DiscoverResult.parse({ matches: [], nextCursor: null, hasProfile: false }),
    );
  }

  const exclude = new Set<string>([auth.session.id]);

  // Already-swiped filter — mirror /api/feed (so the discover queue doesn't
  // re-show what the user has already swiped on).
  const swiped = await prisma.swipe.findMany({
    where: { fromUserId: auth.session.id },
    select: { toUserId: true },
  });
  for (const row of swiped) exclude.add(row.toUserId);

  // Discovery 'seen' filter — "Recently seen" = seenAt within the last 30
  // days; ancient 'seen' rows re-qualify candidates so the queue keeps moving.
  const recentlySeen = await prisma.discovery.findMany({
    where: {
      viewerUserId: auth.session.id,
      status: 'seen',
      seenAt: { gte: new Date(Date.now() - SEEN_WINDOW_MS) },
    },
    select: { targetUserId: true },
  });
  for (const row of recentlySeen) exclude.add(row.targetUserId);

  const candidates = await prisma.profile.findMany({
    where: {
      id: query.data.cursor ? { gt: query.data.cursor } : undefined,
      userId: { notIn: [...exclude] },
    },
    orderBy: { id: 'asc' },
    take: CANDIDATE_FETCH,
  });

  // Batch read of `User.name` for every candidate in one go — never expose
  // email/id. Missing rows default to ''; the UI shows a deterministic
  // fallback.
  const candidateUserIds = candidates.map((row) => row.userId);
  const userRows =
    candidateUserIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: candidateUserIds } },
          select: { id: true, name: true },
        });
  const nameById = new Map<string, string>(userRows.map((row) => [row.id, row.name ?? '']));

  const viewerItem = profileShape(viewerProfile);

  // Stable order: score DESC then id ASC. Shape each candidate once — score
  // and sharedInterests computed side-by-side from the same viewerItem.
  const scored = candidates
    .map((row) => {
      const profile = profileShape(row);
      const score = scoreMatch(viewerItem, profile).totalScore;
      const shared = interestOverlap(viewerItem.interests, profile.interests).shared;
      return { row, profile, score, shared };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
    });

  const page = scored.slice(0, PAGE_SIZE);
  const matches: DiscoverMatchItem[] = page.map(({ row, profile, score, shared }) => ({
    profile,
    name: nameById.get(row.userId) ?? '',
    score,
    sharedInterests: shared,
  }));
  const nextCursor = page.length === PAGE_SIZE ? (page.at(-1)?.row.id ?? null) : null;

  return NextResponse.json(DiscoverResult.parse({ matches, nextCursor, hasProfile: true }));
}
