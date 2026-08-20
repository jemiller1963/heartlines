// @polsia:user-owned — post-signup seam. A server page that exports metadata
// and renders a client island; the island owns submission because it needs
// useForm + useEffect + useRouter. Mirrors `(auth)/profile/page.tsx`'s
// form/data-plane shape (apiFetch + zod contract + applyServerErrors), but
// advances to /feed on success instead of staying put.

import type { Metadata } from 'next';
import { OnboardingForm } from './onboarding-form';

export const metadata: Metadata = {
  title: 'Get started',
  robots: { index: false },
};

export default function OnboardingPage() {
  return <OnboardingForm />;
}
