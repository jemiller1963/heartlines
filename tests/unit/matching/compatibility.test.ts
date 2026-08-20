import { describe, expect, it } from 'vitest';
import type { ProfileItem } from '@/lib/contracts/profile';
import { scoreMatch } from '@/lib/matching/compatibility';

const NOW = new Date().toISOString();

function profile(overrides: Partial<ProfileItem> & { interests: string[] }): ProfileItem {
  return {
    id: overrides.id ?? 'p-id',
    userId: overrides.userId ?? 'u-id',
    age: overrides.age ?? 30,
    location: overrides.location ?? 'Paris',
    interests: overrides.interests,
    avatarUrl: overrides.avatarUrl ?? null,
    createdAt: overrides.createdAt ?? NOW,
    updatedAt: overrides.updatedAt ?? NOW,
  };
}

describe('scoreMatch — identical profiles', () => {
  it('returns totalScore ≈ 100, full shared count, all dimensions at 1', () => {
    const a = profile({ id: 'a', interests: ['hiking', 'cooking', 'jazz'] });
    const b = profile({ id: 'b', interests: ['hiking', 'cooking', 'jazz'] });
    const result = scoreMatch(a, b);
    expect(result.totalScore).toBe(100);
    expect(result.sharedInterestCount).toBe(3);
    expect(result.ageScore).toBe(1);
    expect(result.locationScore).toBe(1);
    expect(result.sharedInterestDepth).toBeCloseTo(1, 5);
  });
});

describe('scoreMatch — zero overlap', () => {
  it('returns totalScore ≈ 0 when nothing matches and interests are disjoint', () => {
    const a = profile({ interests: ['hiking', 'cooking'], age: 30, location: 'Paris' });
    const b = profile({ interests: ['paragliding', 'music'], age: 95, location: 'Lyon' });
    const result = scoreMatch(a, b);
    expect(result.totalScore).toBe(0);
    expect(result.sharedInterestCount).toBe(0);
    // age gap=65 → clamped to 30 → ageScore=0
    expect(result.ageScore).toBe(0);
    expect(result.locationScore).toBe(0);
  });
});

describe('scoreMatch — same city + 3 shared interests + 20yr age gap', () => {
  it('lands moderately high on interests, lower on age, blended ~80', () => {
    const a = profile({ age: 30, location: 'Paris', interests: ['hiking', 'cooking', 'jazz'] });
    const b = profile({ age: 50, location: 'Paris', interests: ['hiking', 'cooking', 'jazz'] });
    const result = scoreMatch(a, b);
    // ageScore = 1 - 20/30 ≈ 0.333
    expect(result.ageScore).toBeCloseTo(1 - 20 / 30, 5);
    expect(result.locationScore).toBe(1);
    expect(result.sharedInterestCount).toBe(3);
    // 0.3·0.333 + 0.2·1 + 0.5·1 = 0.1 + 0.2 + 0.5 = 0.80 → 80
    expect(result.totalScore).toBe(80);
  });
});

describe('scoreMatch — partial tag overlap', () => {
  it('captures sharedInterestDepth > 0 but sharedInterestCount = 0 when exact strings diverge', () => {
    const a = profile({ interests: ['rock climbing', 'cooking'] });
    const b = profile({ interests: ['climbing', 'music'] });
    const result = scoreMatch(a, b);
    // exact normalized: "rock climbing" vs "climbing" → no shared exact strings
    expect(result.sharedInterestCount).toBe(0);
    // tokens: a={rock, climbing, cooking}, b={climbing, music}; shared=1, union=4
    expect(result.sharedInterestDepth).toBeCloseTo(1 / 4, 5);
    expect(result.sharedInterestDepth).toBeGreaterThan(0);
    expect(result.sharedInterestDepth).toBeLessThan(1);
  });
});

describe('scoreMatch — case normalization', () => {
  it('matches location case-insensitively', () => {
    const a = profile({ location: 'Paris', interests: ['hiking'] });
    const b = profile({ location: 'paris', interests: ['music'] });
    expect(scoreMatch(a, b).locationScore).toBe(1);
  });

  it('matches interests case-insensitively for sharedInterestCount', () => {
    const a = profile({ interests: ['HIKING', 'cooking'] });
    const b = profile({ interests: ['hiking', 'music'] });
    const result = scoreMatch(a, b);
    expect(result.sharedInterestCount).toBe(1);
  });
});
