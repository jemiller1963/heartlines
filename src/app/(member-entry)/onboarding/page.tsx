// @polsia:user-owned — authenticated onboarding page.

import type { Metadata } from 'next';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = {
  title: 'Get started',
  robots: { index: false },
};

export default function OnboardingPage() {
  return <OnboardingForm />;
}
