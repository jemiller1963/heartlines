// @polsia:user-owned — group-wide authed layout for the matching-feed MVP.
// Wraps every page in `(dashboard)/**` (e.g. /dashboard, /profile, /feed) in
// the shared signed-in DashboardShell so the chrome (sidebar / sign-out) is
// consistent. The per-page layout at `(dashboard)/dashboard/layout.tsx` is
// redundant once this file exists and has been removed.

import type { ReactNode } from 'react';
import { DashboardShell } from '@/components/custom/dashboard/dashboard-shell';

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
