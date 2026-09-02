// @polsia:user-owned — authenticated entry shell for onboarding/review handoff.

import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/custom/dashboard/dashboard-shell';

export default function MemberEntryLayout({ children }: { children: ReactNode }) {
  return <DashboardShell variant="minimal">{children}</DashboardShell>;
}
