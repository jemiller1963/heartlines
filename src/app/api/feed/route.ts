// @polsia:user-owned — matching-feed Feed API.
//
// requireAuth gates access. Returns one page of scored profiles, excluding the
// viewer and anyone they've already swiped on. Cursor = last profile.id;
// ordering = score DESC, profile.id ASC for stable pagination. If the viewer
// hasn't filled in their profile, returns an empty `items` with `hasProfile:
// false` so the page can render a "edit your profile first" CTA.

import 'server-only';
import { NextResponse } from 'next/server';
import { scoreCandidate } from '@/lib/business/matching';
import { FeedList, FeedQuery } from '@/lib/contracts/feed';
import { ProfileItem } from '@/lib/contracts/profile';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;

function profileShape(row: {
  id: string;
  userId: string;
  age: number;
  location: string;
  interests: string[];
  bio: string | null;
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const query = FeedQuery.safeParse({
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
    return NextResponse.json(FeedList.parse({ items: [], nextCursor: null, hasProfile: false }));
  }

  // Already-swiped user ids (from this viewer only) — exclude so we never
  // re-show the same card.
  const swiped = await prisma.swipe.findMany({
    where: { fromUserId: auth.session.id },
    select: { toUserId: true },
  });
  const swipedIds = new Set(swiped.map((row) => row.toUserId));
  swipedIds.add(auth.session.id); // also exclude the viewer themselves

  // Already-blocked user ids (one-way, viewer→target). Prevents re-showing
  // users the viewer explicitly hid. Mirrors how /api/discover/matches merges
  // exclusions into a single Set.
  const blocks = await prisma.block.findMany({
    where: { blockerId: auth.session.id },
    select: { blockedId: true },
  });
  for (const row of blocks) swipedIds.add(row.blockedId);

  // Pull a generous page from the DB, then in-memory sort by score so cursor
  // pagination stays stable. PAGE_SIZE candidate rows = enough scored rows for
  // one visible page even when many score identically.
  const CANDIDATE_FETCH = PAGE_SIZE * 4;
  const candidates = await prisma.profile.findMany({
    where: {
      id: query.data.cursor ? { gt: query.data.cursor } : undefined,
      userId: { notIn: [...swipedIds] },
    },
    orderBy: { id: 'asc' },
    take: CANDIDATE_FETCH,
  });

  const scored = candidates.map((row) => {
    const result = scoreCandidate(viewerProfile, row);
    return { row, score: result.score, shared: result.sharedInterests };
  });

  // Stable order: score DESC then id ASC (id ASC was the load order, so the
  // .sort comparator compares id strings for ties).
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
  });

  const page = scored.slice(0, PAGE_SIZE);
  const items = page.map(({ row, score, shared }) => ({
    profile: profileShape(row),
    matchScore: score,
    sharedInterests: shared,
  }));
  const nextCursor = page.length === PAGE_SIZE ? (page.at(-1)?.row.id ?? null) : null;

  return NextResponse.json(FeedList.parse({ items, nextCursor, hasProfile: true }));
}
