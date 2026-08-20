// @polsia:user-owned — per-dimension compatibility breakdown for the matching
// feed. Pairs with @/lib/business/matching (which exposes the underlying
// primitives + the blend weights); this module extends the public API with a
// structure tailored for the matching-feed UI and the matching /api handler.
// Server/client island safe: no Prisma, no fetch, no env, no side effects.

import {
  ageProximity,
  locationProximity,
  matchingWeights,
  normalizeInterests,
} from '@/lib/business/matching';
import type { ProfileItem } from '@/lib/contracts/profile';

export interface CompatibilityResult {
  /** 0–100 blend of age, location, and interest overlap. */
  totalScore: number;
  /** 0–1: 1 for the same age, decaying linearly, 0 at ≥30yr gap. */
  ageScore: number;
  /** 0–1: 1 for case-insensitive same city, else 0. */
  locationScore: number;
  /** Normalized-and-deduped count of exact-string interest matches. */
  sharedInterestCount: number;
  /** 0–1 token-level Jaccard — captures "rock climbing" vs "climbing" partial overlap. */
  sharedInterestDepth: number;
}

const tokenize = (interest: string): string[] =>
  interest
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);

function interestTokenJaccard(mine: readonly string[], theirs: readonly string[]): number {
  const myTokens = new Set(mine.flatMap(tokenize));
  const theirTokens = new Set(theirs.flatMap(tokenize));
  if (myTokens.size === 0 && theirTokens.size === 0) return 0;
  let shared = 0;
  for (const token of myTokens) {
    if (theirTokens.has(token)) shared += 1;
  }
  const unionSize = new Set([...myTokens, ...theirTokens]).size;
  return shared / unionSize;
}

export function scoreMatch(a: ProfileItem, b: ProfileItem): CompatibilityResult {
  const ageScore = ageProximity(a.age, b.age);
  const locationScore = locationProximity(a.location, b.location);

  const aInterests = new Set(normalizeInterests(a.interests));
  const bInterests = new Set(normalizeInterests(b.interests));

  let sharedInterestCount = 0;
  for (const interest of aInterests) {
    if (bInterests.has(interest)) sharedInterestCount += 1;
  }

  // sharedInterestCount uses exact-string normalized matches (stable, predictable).
  // sharedInterestDepth uses word tokens — captures partial overlap
  // ("rock climbing" vs "climbing") that exact matching would miss.
  const sharedInterestDepth = interestTokenJaccard(a.interests, b.interests);

  // The interest contribution to totalScore uses count-based ratio (no Jaccard),
  // so identity = 1.0 and a 3-for-3 match is unambiguous regardless of token structure.
  const interestMax = Math.max(aInterests.size, bInterests.size, 1);
  const interestRatio = sharedInterestCount / interestMax;

  const blended =
    matchingWeights.age * ageScore +
    matchingWeights.location * locationScore +
    matchingWeights.interest * interestRatio;

  return {
    totalScore: Math.round(blended * 100),
    ageScore,
    locationScore,
    sharedInterestCount,
    sharedInterestDepth,
  };
}
