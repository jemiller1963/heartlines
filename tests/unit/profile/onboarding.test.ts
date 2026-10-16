// @vitest-environment node

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { onboardingProgressPercent, resumeOnboardingStep } from '@/lib/onboarding';

const baseProfile = {
  id: 'profile-1',
  userId: 'user-1',
  displayName: null,
  age: 63,
  location: 'Waynesboro',
  interests: ['coding'],
  lifestylePreferences: [],
  relationshipIntent: null,
  distancePreference: null,
  lifestyleCharacteristics: [],
  valuesPriorities: [],
  partnerPreferences: [],
  bio: 'Test bio',
  avatarUrl: null,
  verificationStatus: 'unverified' as const,
  createdAt: '2026-10-15T00:00:00.000Z',
  updatedAt: '2026-10-15T00:00:00.000Z',
};

describe('Epic 5 Slice 3 onboarding progression', () => {
  it('starts new members at About You', () => {
    expect(resumeOnboardingStep(null)).toBe(0);
  });

  it('resumes an existing basic profile at Lifestyle', () => {
    expect(resumeOnboardingStep(baseProfile)).toBe(1);
  });

  it('resumes after lifestyle at Relationship Goals', () => {
    expect(
      resumeOnboardingStep({
        ...baseProfile,
        distancePreference: 'nearby',
      }),
    ).toBe(2);
  });

  it('resumes after relationship goals at Values', () => {
    expect(
      resumeOnboardingStep({
        ...baseProfile,
        distancePreference: 'nearby',
        relationshipIntent: 'companionship',
      }),
    ).toBe(3);
  });

  it('reports deterministic four-step progress', () => {
    expect(onboardingProgressPercent(0)).toBe(25);
    expect(onboardingProgressPercent(1)).toBe(50);
    expect(onboardingProgressPercent(2)).toBe(75);
    expect(onboardingProgressPercent(3)).toBe(100);
  });
});

describe('Slice 3 onboarding implementation boundary', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/app/(member-entry)/onboarding/onboarding-form.tsx'),
    'utf8',
  );

  it('renders the canonical structured questionnaire fields', () => {
    for (const field of [
      'distancePreference',
      'lifestyleCharacteristics',
      'relationshipIntent',
      'partnerPreferences',
      'valuesPriorities',
    ]) {
      expect(source).toContain(`name="${field}"`);
    }
  });

  it('persists through the owner profile endpoint only', () => {
    expect(source).toContain("'/api/profile'");
    expect(source).not.toContain('/api/onboarding');
  });

  it('does not submit for review or route through member-entry in Slice 3', () => {
    expect(source).not.toContain('/api/member-entry');
    expect(source).not.toContain('/review-status');
    expect(source).not.toContain("router.replace('/feed')");
  });
});
