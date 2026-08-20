// @polsia:user-owned — pure per-axis scoring for the matching-feed
// compatibility endpoint. Pure logic — safe for both server route handlers
// and client islands; no Prisma, no fetch, no env.
// Reuses `interestOverlap` from `@/lib/business/matching` so Jaccard math
// stays consistent across the product (matches feed, discover, conversation
// starters). Do NOT reimplement overlap here.

import {
  interestOverlap,
  locationProximity,
  normalizeInterests,
  type ProfileLike,
} from '@/lib/business/matching';

export type CompatibilityInputs = ProfileLike & { bio: string | null };

export interface CompatibilityAxis {
  /** 0–1 normalized score for this axis. */
  score: number;
  /** Tokens the two profiles share on this axis (capped for lifestyle). */
  shared: string[];
  /** Tokens unique to one side (capped for lifestyle). */
  divergent: string[];
}

export interface CompatibilityBreakdown {
  /** Bio-token Jaccard — values/identity overlap. */
  values: CompatibilityAxis;
  /** interestOverlap (Jaccard) on normalized interest lists. */
  interests: CompatibilityAxis;
  /** Weighted blend of location proximity + "how many interests overlap". */
  lifestyle: CompatibilityAxis;
  /** 0–1 weighted blend of the three axes (values 0.3, interests 0.4, lifestyle 0.3). */
  overall: number;
}

// Short, English-only stopwords dropped from bio tokens — they don't carry
// identity signal at this granularity.
const STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'in',
  'on',
  'at',
  'to',
  'of',
  'for',
  'with',
  'by',
  'as',
  'i',
  'me',
  'my',
  'you',
  'your',
  'we',
  'our',
  'it',
  'its',
  'so',
  'do',
]);

const BIO_TOKEN_RE = /[\s\p{P}]+/u;

function tokenizeBio(s: string | null): string[] {
  if (!s) return [];
  const out: string[] = [];
  for (const raw of s.toLowerCase().split(BIO_TOKEN_RE)) {
    if (raw.length > 2 && !STOPWORDS.has(raw)) out.push(raw);
  }
  return out;
}

const LIFESTYLE_INTEREST_CAP = 3;

function axis(score: number, shared: string[], divergent: string[]): CompatibilityAxis {
  return {
    score: Math.max(0, Math.min(1, score)),
    shared,
    divergent,
  };
}

function interestsAxis(
  viewer: CompatibilityInputs,
  target: CompatibilityInputs,
): CompatibilityAxis {
  const overlap = interestOverlap(viewer.interests, target.interests);
  const a = new Set(normalizeInterests(viewer.interests));
  const b = new Set(normalizeInterests(target.interests));
  const divergent: string[] = [];
  for (const t of a) if (!b.has(t)) divergent.push(t);
  for (const t of b) if (!a.has(t)) divergent.push(t);
  return axis(overlap.overlap, [...overlap.shared], divergent);
}

function valuesAxis(viewer: CompatibilityInputs, target: CompatibilityInputs): CompatibilityAxis {
  // Bio-token Jaccard — captures "rock climbing" vs "outdoors enthusiast"
  // partial overlap that pure interest matching misses. Heuristic only;
  // both bios null is a zero-axis (no throw, no penalty multiplier).
  const aTokens = new Set(tokenizeBio(viewer.bio));
  const bTokens = new Set(tokenizeBio(target.bio));
  if (aTokens.size === 0 && bTokens.size === 0) {
    return axis(0, [], []);
  }
  const shared: string[] = [];
  for (const t of aTokens) if (bTokens.has(t)) shared.push(t);
  const divergent: string[] = [];
  for (const t of aTokens) if (!bTokens.has(t)) divergent.push(t);
  for (const t of bTokens) if (!aTokens.has(t)) divergent.push(t);
  const unionSize = new Set([...aTokens, ...bTokens]).size;
  const score = unionSize === 0 ? 0 : shared.length / unionSize;
  return axis(score, shared, divergent);
}

function lifestyleAxis(
  viewer: CompatibilityInputs,
  target: CompatibilityInputs,
): CompatibilityAxis {
  // Weighted blend — location is the dominant lifestyle signal; the interest
  // component is "how many normalized interests overlap" using the same
  // exact-match list interestOverlap exposes, so we don't reimplement Jaccard.
  const a = new Set(normalizeInterests(viewer.interests));
  const b = new Set(normalizeInterests(target.interests));
  const shared: string[] = [];
  for (const t of a) if (b.has(t)) shared.push(t);
  const aOnly: string[] = [];
  for (const t of a) if (!b.has(t)) aOnly.push(t);
  const bOnly: string[] = [];
  for (const t of b) if (!a.has(t)) bOnly.push(t);
  const denominator = Math.max(a.size, b.size, 1);
  const interestRatio = shared.length / denominator;
  const score = 0.7 * locationProximity(viewer.location, target.location) + 0.3 * interestRatio;
  return axis(score, shared.slice(0, LIFESTYLE_INTEREST_CAP), [
    ...aOnly.slice(0, LIFESTYLE_INTEREST_CAP),
    ...bOnly.slice(0, LIFESTYLE_INTEREST_CAP),
  ]);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function scoreCompatibility(
  viewer: CompatibilityInputs,
  target: CompatibilityInputs,
): CompatibilityBreakdown {
  const values = valuesAxis(viewer, target);
  const interests = interestsAxis(viewer, target);
  const lifestyle = lifestyleAxis(viewer, target);
  const overall = round4(0.3 * values.score + 0.4 * interests.score + 0.3 * lifestyle.score);
  return { values, interests, lifestyle, overall };
}
