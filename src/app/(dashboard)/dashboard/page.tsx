// @polsia:user-owned — compatibility entry route for signed-in members.
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';
import { MemberEntryResponse } from '@/lib/contracts/member-entry';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/member-entry', { schema: MemberEntryResponse })
      .then((entry) => {
        if (!cancelled) router.replace(entry.destination);
      })
      .catch(() => {
        if (!cancelled) toast.error('Could not open your member area.');
      });

    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm text-muted-foreground">Taking you to your member area…</p>
    </main>
  );
}
