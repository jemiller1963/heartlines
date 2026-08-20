// @polsia:user-owned — pure compatibility-score logic for the matching feed.
// No Prisma, no `fetch`, no env — safe to import from both server and tests.

export interface ProfileLike {
  age: number;
  location: string;
  interests: string[];
}

export interface MatchResult {
  score: number;
  sharedInterests: string[];
}

const AGE_GAP_CAP = 30;
// Blend weights. Interest overlap dwarfs age/location because shared
// hobbies are the strongest signal in the matching feed MVP.
const WEIGHT_AGE = 0.3;
const WEIGHT_LOCATION = 0.2;
const WEIGHT_INTEREST = 0.5;

/** Normalize a list of interests: lowercase, trim, dedupe, drop empties. */
export function normalizeInterests(interests: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const raw of interests) {
    const lower = raw.toLowerCase().trim();
    if (lower) seen.add(lower);
  }
  return [...seen];
}

export function ageProximity(myAge: number, otherAge: number): number {
  const gap = Math.min(Math.abs(myAge - otherAge), AGE_GAP_CAP);
  return 1 - gap / AGE_GAP_CAP;
}

export function locationProximity(myLocation: string, otherLocation: string): number {
  return myLocation.toLowerCase().trim() === otherLocation.toLowerCase().trim() ? 1 : 0;
}

export function interestOverlap(
  myInterests: readonly string[],
  otherInterests: readonly string[],
): { overlap: number; shared: string[] } {
  const mine = new Set(normalizeInterests(myInterests));
  const theirs = new Set(normalizeInterests(otherInterests));
  if (mine.size === 0 && theirs.size === 0) {
    return { overlap: 0, shared: [] };
  }
  const shared: string[] = [];
  for (const interest of mine) {
    if (theirs.has(interest)) shared.push(interest);
  }
  const unionSize = new Set([...mine, ...theirs]).size;
  return { overlap: shared.length / unionSize, shared };
}

export function scoreCandidate(me: ProfileLike, other: ProfileLike): MatchResult {
  const age = ageProximity(me.age, other.age);
  const loc = locationProximity(me.location, other.location);
  const { overlap, shared } = interestOverlap(me.interests, other.interests);
  const blended = WEIGHT_AGE * age + WEIGHT_LOCATION * loc + WEIGHT_INTEREST * overlap;
  return {
    score: Math.round(blended * 100),
    sharedInterests: shared,
  };
}

export const matchingWeights = {
  age: WEIGHT_AGE,
  location: WEIGHT_LOCATION,
  interest: WEIGHT_INTEREST,
} as const;
