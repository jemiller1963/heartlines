// @polsia:user-owned — '/events/[id]' Server Component. Exports per-page
// metadata + renders the `<EventDetail/>` client island. NO server-side data
// fetch (no `await prisma`, no `await fetch`) — the island reads
// `GET /api/events/[id]` on mount via `apiFetch`. Server actions are banned:
// this app's data plane is `apiFetch` + `/api/*` route handlers.
//
// Lives inside `(dashboard)/**` so `DashboardShell` already wrappers it —
// the shell's `useEffect → router.replace('/login')` carries the unauthed
// redirect; the route handler's `authOrResponse` carries the 401 surface.

import type { Metadata } from 'next';
import { EventDetail } from '@/components/custom/events/event-detail';

export const metadata: Metadata = {
  title: 'Event',
};

export const dynamic = 'force-dynamic';

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <EventDetail id={id} />
    </div>
  );
}
