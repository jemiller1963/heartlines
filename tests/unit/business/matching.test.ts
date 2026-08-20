import { describe, expect, it } from 'vitest';
import {
  ageProximity,
  interestOverlap,
  locationProximity,
  normalizeInterests,
  scoreCandidate,
} from '@/lib/business/matching';

const me = { age: 60, location: 'Paris', interests: ['hiking', 'cooking', 'jazz'] };

describe('ageProximity', () => {
  it('returns 1 when ages match', () => {
    expect(ageProximity(60, 60)).toBe(1);
  });
  it('decays linearly then clamps beyond the gap cap', () => {
    expect(ageProximity(60, 70)).toBeCloseTo(1 - 10 / 30, 5);
    expect(ageProximity(60, 95)).toBeCloseTo(1 - 30 / 30, 5); // gap=35, clamped to 30
    expect(ageProximity(60, 25)).toBeCloseTo(1 - 30 / 30, 5); // gap=35, clamped to 30
  });
});

describe('locationProximity', () => {
  it('matches case-insensitively when the city matches', () => {
    expect(locationProximity('Paris', 'paris')).toBe(1);
    expect(locationProximity('Paris', 'Paris')).toBe(1);
  });
  it('returns 0 when different', () => {
    expect(locationProximity('Paris', 'Lyon')).toBe(0);
  });
});

describe('interestOverlap (Jaccard)', () => {
  it('returns 0 with no interests on either side', () => {
    expect(interestOverlap([], []).overlap).toBe(0);
  });
  it('returns 1 with the same set', () => {
    const a = ['hiking', 'cooking'];
    const b = ['cooking', 'hiking'];
    expect(interestOverlap(a, b).overlap).toBe(1);
    expect(interestOverlap(a, b).shared).toEqual(['hiking', 'cooking']); // normalized lowercase
  });
  it('dedupes + case-insensitive', () => {
    const result = interestOverlap(['Hiking', 'HIKING', 'cooking'], ['hiking', 'music']);
    // mine normalized = {hiking, cooking}; theirs = {hiking, music}; union=3; overlap=1
    expect(result.overlap).toBeCloseTo(1 / 3, 5);
    expect(result.shared).toEqual(['hiking']);
  });
  it('partial overlap yields a fraction', () => {
    const result = interestOverlap(['a', 'b', 'c'], ['b', 'c', 'd']);
    // intersection=2, union=4
    expect(result.overlap).toBeCloseTo(0.5, 5);
    expect(result.shared.sort()).toEqual(['b', 'c']);
  });
});

describe('normalizeInterests', () => {
  it('lowercases, trims, and dedupes', () => {
    expect(normalizeInterests(['HiKING ', 'hiking', ' Cooking', ''])).toEqual([
      'hiking',
      'cooking',
    ]);
  });
});

describe('scoreCandidate', () => {
  it('returns 100 for an identical profile', () => {
    const other = { ...me };
    const result = scoreCandidate(me, other);
    expect(result.score).toBe(100);
    expect(result.sharedInterests).toHaveLength(3);
  });

  it('returns 100 for same city + identical interests + same age', () => {
    const result = scoreCandidate(me, {
      age: me.age,
      location: 'PARIS', // case-insensitive parity with 'Paris'
      interests: ['HIKING', 'cooking', 'jazz'],
    });
    expect(result.score).toBe(100);
  });

  it('caps age contribution when far apart while other signals match', () => {
    const result = scoreCandidate(me, {
      age: 95, // gap=35 clamped to 30 → age=0
      location: 'Paris',
      interests: ['hiking', 'cooking', 'jazz'],
    });
    // age=0 + loc=1 + overlap=1 = 0.2 + 0.5 = 0.7 → 70
    expect(result.score).toBe(70);
  });

  it('returns 0 when nothing matches and interest lists are disjoint', () => {
    const result = scoreCandidate(me, {
      age: 95,
      location: 'Lyon',
      interests: ['paragliding'],
    });
    // age=0, loc=0, overlap=0
    expect(result.score).toBe(0);
    expect(result.sharedInterests).toEqual([]);
  });

  it('partial overlap lands in a mid-range score', () => {
    const result = scoreCandidate(me, {
      age: 65,
      location: 'Paris',
      interests: ['hiking', 'music', 'travel'],
    });
    // age = 1 - 5/30 = 0.833
    // loc = 1
    // overlap: mine={hiking, cooking, jazz}, theirs={hiking, music, travel} -> intersection=1, union=5 -> 0.2
    // weight blend = 0.3*0.833 + 0.2*1 + 0.5*0.2 = 0.25 + 0.2 + 0.1 = 0.55 → 55
    expect(result.score).toBe(55);
    expect(result.sharedInterests).toEqual(['hiking']);
  });
});
