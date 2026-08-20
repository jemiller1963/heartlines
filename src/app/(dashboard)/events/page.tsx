// @polsia:user-owned — Events listing page. Server Component that exports
// per-page metadata and renders the `<EventsList/>` island. Lives inside the
// `(dashboard)/**` group so the DashboardShell wraps it — the shell's
// client-side `useEffect → router.replace('/login')` handles unauthed visits.
//
// A "Create event" CTA sits in the page header so the new-event path is
// reachable from the listing affordance — the brief's done-condition requires
// a signed-in host to navigate from /events to /events/new with one click.

import type { Metadata } from 'next';
import Link from 'next/link';
import { EventsList } from '@/components/custom/events/events-list';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Events',
};

export const dynamic = 'force-dynamic';

export default function EventsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Upcoming</p>
            <h1 className="text-h2 font-bold text-foreground">Events</h1>
          </div>
          <Button asChild>
            <Link href="/events/new">Create event</Link>
          </Button>
        </div>
      </header>
      <EventsList />
    </div>
  );
}
