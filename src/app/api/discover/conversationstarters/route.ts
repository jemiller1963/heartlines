// @polsia:user-owned — Matching-feed "Starter ideas" API.
//
// Authenticated only. Body carries ONLY the target id; overlap is recomputed
// server-side via interestOverlap so the client and server cannot drift.
// Calls the platform AI proxy (generateObject) with a tightly-bounded prompt
// (≤80 tokens, no PII beyond what the match card already shows: name,
// optional bio truncated to 300 chars, the shared-interest array), parses
// the result, and returns three short prompts. NEVER 5xx — any failure
// path returns 200 with three hard-coded neutral openers (reason "fallback")
// so the client can degrade gracefully. Per-pair in-module cache, 10-minute
// TTL, eviction on insert when > 100 entries.

import 'server-only';
import { z } from 'zod';
import { generateObject } from '@/lib/ai/client';
import { interestOverlap } from '@/lib/business/matching';
import { ConversationStartersRequest, ConversationStartersResult } from '@/lib/contracts/discover';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

const TTL_MS = 10 * 60_000;
const CACHE_LIMIT = 100;

// Hard-coded neutral openers when no overlap or the AI call fails. Kept
// short, friendly, and grounded on nothing in particular — they read
// like normal "break the ice" prompts, not "I couldn't generate".
const NEUTRAL_OPENERS = [
  'Hi! What kind of weekend are you most excited about right now?',
  'Hey — what has been the highlight of your week so far?',
  'Hi there! Is there a song, podcast, or show you keep coming back to?',
];

const startersSchema = z.array(z.string().min(1).max(280)).length(3);

type CacheEntry = {
  starters: string[];
  reason: 'generated' | 'no-overlap' | 'fallback';
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

function cacheKey(viewerId: string, targetUserId: string): string {
  return `${viewerId}:${targetUserId}`;
}

function cacheGet(key: string): CacheEntry | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  // Lazy-evict stale entries on read by re-inserting (keeps Map in MRU-ish order).
  cache.delete(key);
  cache.set(key, entry);
  return entry;
}

function cacheSet(key: string, entry: CacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function flattenError(err: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(err.flatten().fieldErrors)
      .map(([field, messages]) => [field, messages?.[0] ?? ''])
      .filter(([, msg]) => Boolean(msg)),
  );
}

function truncate(s: string | null | undefined, max: number): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

export async function POST(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = ConversationStartersRequest.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }
  const { toUserId } = parsed.data;

  if (toUserId === auth.session.id) {
    return Response.json(
      { errors: { toUserId: 'You cannot generate starters for yourself.' } },
      { status: 400 },
    );
  }

  const cacheEntry = cacheGet(cacheKey(auth.session.id, toUserId));
  if (cacheEntry) {
    return Response.json(
      ConversationStartersResult.parse({
        starters: cacheEntry.starters,
        reason: cacheEntry.reason,
      }),
    );
  }

  const [viewerProfile, targetProfile, targetUser] = await Promise.all([
    prisma.profile.findFirst({ where: { userId: auth.session.id }, select: { interests: true } }),
    prisma.profile.findFirst({
      where: { userId: toUserId },
      select: { interests: true, bio: true },
    }),
    prisma.user.findFirst({ where: { id: toUserId }, select: { name: true } }),
  ]);

  // Missing profile/user OR empty viewer interests OR empty target interests
  // all collapse into the neutral-opener path. No 5xx, no INFO leak.
  if (!targetProfile || !targetUser || !viewerProfile) {
    const result: ConversationStartersResult = {
      starters: NEUTRAL_OPENERS,
      reason: 'no-overlap',
    };
    cacheSet(cacheKey(auth.session.id, toUserId), {
      starters: result.starters,
      reason: 'no-overlap',
      expiresAt: Date.now() + TTL_MS,
    });
    return Response.json(result);
  }

  const overlap = interestOverlap(viewerProfile.interests, targetProfile.interests).shared;
  if (overlap.length === 0) {
    const result: ConversationStartersResult = {
      starters: NEUTRAL_OPENERS,
      reason: 'no-overlap',
    };
    cacheSet(cacheKey(auth.session.id, toUserId), {
      starters: result.starters,
      reason: 'no-overlap',
      expiresAt: Date.now() + TTL_MS,
    });
    return Response.json(result);
  }

  const name = (targetUser.name ?? '').trim();
  const bioTrunc = truncate(targetProfile.bio, 300);
  const reason: ConversationStartersResult['reason'] = 'generated';

  const system =
    'You generate 3 short, friendly first-message prompts (max 140 chars each). ' +
    'Output STRICT JSON: {"starters": ["...", "...", "..."]}. ' +
    'Ground each prompt in the supplied shared interests and the candidate name/bio. ' +
    'Never reference anything not in the prompt. No placeholders, no ellipses.';

  const userPayload = {
    name,
    bio: bioTrunc,
    sharedInterests: overlap,
  };

  try {
    const data = await generateObject<{ starters: string[] }>({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify(userPayload) },
      ],
      task: 'conversation-starters',
      temperature: 0.7,
      signal: AbortSignal.timeout(8_000),
    });

    const validated = startersSchema.safeParse(data.starters);
    if (!validated.success) throw new Error('schema-mismatch');

    const result: ConversationStartersResult = { starters: validated.data, reason };
    cacheSet(cacheKey(auth.session.id, toUserId), {
      starters: result.starters,
      reason,
      expiresAt: Date.now() + TTL_MS,
    });
    return Response.json(result);
  } catch {
    const fallback: ConversationStartersResult = {
      starters: NEUTRAL_OPENERS,
      reason: 'fallback',
    };
    cacheSet(cacheKey(auth.session.id, toUserId), {
      starters: fallback.starters,
      reason: 'fallback',
      expiresAt: Date.now() + TTL_MS,
    });
    return Response.json(fallback);
  }
}
