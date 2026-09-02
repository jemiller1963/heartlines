// @polsia:user-owned — '/events/[id]' client island. Reads the single-event
// detail from `GET /api/events/[id]` with the shared `EventDetail` zod
// contract and renders hero (title, host via hostName, formatted startTime,
// city, currentAttendees of maxAttendees). When `currentUserId` resolves and
// matches `event.hostId`, the host sees a Cancel button that calls
// `DELETE /api/events/[id]`. On 204 we `toast.success`, then router.push to
// `/events` + router.refresh so the listing re-fetches without the row.
//
// Loading/error: Loading mirrors the four-skeleton block from `EventsList`
// (same eyebrow + heading + dl + badge rhythm). 404 (and any other error)
// renders a friendly "Event not found" card + back-to-listing link; we DO NOT
// re-fetch on success so the island stays cheap.

'use client';

import { CalendarDays, MapPin, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import {
  EventDetail as EventDetailSchema,
  type EventDetail as EventDetailValue,
} from '@/lib/contracts/events';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; event: EventDetailValue }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string };

type CancelState = 'idle' | 'cancelling' | 'error';

const ERROR_MESSAGE = 'Unable to load this event.';
const FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatStartTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return FORMATTER.format(date);
}

export interface EventDetailProps {
  id: string;
}

export function EventDetail({ id }: EventDetailProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [cancelState, setCancelState] = useState<CancelState>('idle');

  // `data?.user?.id` is `undefined` while the session resolves and `null`
  // for logged-out visitors. Pass through as a single nullable string.
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const event = await apiFetch<EventDetailValue>(`/api/events/${id}`, {
          method: 'GET',
          schema: EventDetailSchema,
        });
        if (!cancelled) setState({ kind: 'ready', event });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        if (/\(404\)/.test(message)) {
          setState({ kind: 'not-found' });
          return;
        }
        setState({ kind: 'error', message: ERROR_MESSAGE });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleCancel = async () => {
    if (cancelState === 'cancelling') return;
    setCancelState('cancelling');
    try {
      await apiFetch(`/api/events/${id}`, { method: 'DELETE' });
      toast.success('Event cancelled');
      router.push('/events');
      router.refresh();
    } catch {
      setCancelState('error');
    }
  };

  if (state.kind === 'loading') {
    return (
      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-3 pb-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-3/4" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4 py-4">
          <Skeleton className="h-4 w-1/2" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-5 w-40" />
        </CardContent>
      </Card>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <Card className="border-border/70 bg-card shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <CalendarDays aria-hidden="true" className="size-8 text-muted-foreground" />
          <h2 className="text-h3 font-semibold text-foreground">Event not found</h2>
          <p className="max-w-md text-body text-muted-foreground">
            The event you&apos;re looking for doesn&apos;t exist or has been cancelled.
          </p>
          <Button asChild variant="outline">
            <Link href="/events">Back to events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === 'error') {
    return (
      <Card className="border-border/70 bg-card shadow-sm">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <h2 className="text-h3 font-semibold text-foreground">{state.message}</h2>
          <p role="alert" className="text-small text-destructive">
            Try reloading the page.
          </p>
          <Button asChild variant="outline">
            <Link href="/events">Back to events</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { event } = state;
  const isHost = currentUserId !== null && event.hostId === currentUserId;
  const spotsLeft = Math.max(0, event.maxAttendees - event.currentAttendees);
  const isFull = spotsLeft === 0;

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="flex flex-col gap-3 pb-4">
        <p className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-3.5 text-brand-600" />
          Upcoming
        </p>
        <h1 className="text-h2 font-bold leading-tight text-foreground">{event.title}</h1>
        <p className="text-body font-medium text-foreground">
          <span className="text-muted-foreground">Hosted by </span>
          {event.hostName}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 py-4">
        <dl className="grid gap-3 text-body text-muted-foreground sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Start time</dt>
            <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
            <dd className="text-foreground">{formatStartTime(event.startTime)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">City</dt>
            <MapPin aria-hidden="true" className="size-4 shrink-0 text-brand-600" />
            <dd className="text-foreground">{event.city}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          <Badge variant={isFull ? 'destructive' : 'secondary'} className="gap-1.5">
            <Users aria-hidden="true" className="size-3" />
            {event.currentAttendees} of {event.maxAttendees} attending
          </Badge>
          {isFull ? (
            <span className="text-small font-medium text-destructive">Full</span>
          ) : (
            <span className="text-small text-muted-foreground">
              {spotsLeft} {spotsLeft === 1 ? 'spot' : 'spots'} left
            </span>
          )}
        </div>

        {isHost ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelState === 'cancelling'}
              aria-busy={cancelState === 'cancelling' ? true : undefined}
              aria-label={`Cancel ${event.title}`}
            >
              <Trash2 aria-hidden="true" />
              {cancelState === 'cancelling' ? 'Cancelling…' : 'Cancel event'}
            </Button>
          </div>
        ) : null}

        {cancelState === 'error' ? (
          <p role="alert" className="text-small text-destructive">
            Could not cancel this event. Try again.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
