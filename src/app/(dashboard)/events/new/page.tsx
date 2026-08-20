// @polsia:user-owned — /events/new. Server Component that exports per-page
// metadata and renders the `<EventForm/>` client island. Lives inside the
// `(dashboard)/**` group so the DashboardShell wraps it — the shell's
// `useEffect → router.replace('/login')` handles unauthed visits.
//
// NO server-side data fetch in the page body — the page only owns the
// heading + the form island. Server actions are banned: this app's data
// plane is `apiFetch` + `/api/*` route handlers.

import type { Metadata } from 'next';
import { EventForm } from '@/components/custom/events/event-form';

export const metadata: Metadata = {
  title: 'New Event',
};

export const dynamic = 'force-dynamic';

export default function NewEventPage() {
  return (
    <div className="flex flex-col gap-6">
      <EventForm />
    </div>
  );
}
