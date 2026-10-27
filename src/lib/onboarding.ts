import type { ProfileItem } from '@/lib/contracts/profile';

export type OnboardingStep = 0 | 1 | 2 | 3;

export const ONBOARDING_STEP_TITLES = [
  'About You',
  'Lifestyle',
  'Relationship Goals',
  'Values',
] as const;

export function resumeOnboardingStep(profile: ProfileItem | null): OnboardingStep {
  if (!profile) return 0;
  if (!profile.distancePreference) return 1;
  if (!profile.relationshipIntent) return 2;
  return 3;
}

export function onboardingProgressPercent(step: OnboardingStep): number {
  return ((step + 1) / ONBOARDING_STEP_TITLES.length) * 100;
}
