// @polsia:user-owned — authenticated review handoff page.

import type { Metadata } from 'next';
import { ReviewStatusScreen } from './review-status-screen';

export const metadata: Metadata = {
  title: 'Profile review — Heart Lines',
  robots: { index: false, follow: false },
};

export default function ReviewStatusPage() {
  return <ReviewStatusScreen />;
}
