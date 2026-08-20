// @polsia:user-owned — interactive event card for /events listing. Now a
// 'use client' island — the brief requires an RSVP button that POSTs to
// /api/events/[id]/rsvp and toggles into a "confirmed" state on success.
//
// `EventCard` is the smallest unit the brief owns: the page is a Server
// Component (exports metadata + renders `<EventsList/>`), `EventsList` is
// already a client island that fetches the listing, and `EventCard` is the
// per-row island that holds per-row RSVP state. Render path stays clean —
// each layer only knows about its own boundary.
//
// Host-only Cancel: rendered when `event.hostId === currentUserId` is true.
// Fires `DELETE /api/events/[id]` and on success calls the parent's
// `onCancelled(id)` so `<EventsList/>` filters the row out. On error the
// local state reverts and a destructive alert is surfaced below the card
// body so the host can retry.

'use client';

import { CalendarDays, Check, MapPin, Users } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-client';
import { type EventItem, EventRsvpResult } from '@/lib/contracts/events';

const FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatStartTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return FORMATTER.format(date);
}

type RsvpState = 'idle' | 'submitting' | 'confirmed' | 'error';
type CancelState = 'idle' | 'cancelling' | 'error';

export interface EventCardProps {
  event: EventItem;
  currentUserId: string | null;
  onCancelled?: (id: string) => void;
}

export function EventCard({ event, currentUserId, onCancelled }: EventCardProps) {
  const [state, setState] = useState<RsvpState>('idle');
  const [cancelState, setCancelState] = useState<CancelState>('idle');

  // hostId is non-nullable on the wire (zod string().min(1)) so a null
  // currentUserId (session still loading) can never match — the Cancel
  // button never flashes during session resolution.
  const isHost = currentUserId !== null && event.hostId === currentUserId;

  const handleRsvp = async () => {
    if (state === 'submitting' || state === 'confirmed') return;
    setState('submitting');
    try {
      await apiFetch(`/api/events/${event.id}/rsvp`, {
        method: 'POST',
        schema: EventRsvpResult,
      });
      setState('confirmed');
    } catch {
      setState('error');
    }
  };

  const handleCancel = async () => {
    if (cancelState === 'cancelling') return;
    setCancelState('cancelling');
    try {
      await apiFetch(`/api/events/${event.id}`, { method: 'DELETE' });
      onCancelled?.(event.id);
    } catch {
      setCancelState('error');
    }
  };

  return (
    <Card className="flex flex-col gap-0 border-border/70 bg-card shadow-sm transition-shadow duration-200 hover:shadow-md">
      <CardHeader className="flex flex-col gap-2 pb-3">
        <p className="flex items-center gap-1.5 text-eyebrow text-muted-foreground">
          <CalendarDays aria-hidden="true" className="size-3.5 text-brand-600" />
          Upcoming
        </p>
        <h3 className="text-h3 font-semibold leading-tight text-foreground">{event.title}</h3>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 py-4">
        <p className="text-body font-medium text-foreground">
          <span className="text-muted-foreground">Hosted by </span>
          {event.hostName}
        </p>
        <dl className="grid gap-2 text-small text-muted-foreground sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Start time</dt>
            <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
            <dd className="text-foreground">{formatStartTime(event.startTime)}</dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">City</dt>
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            <dd className="text-foreground">{event.city}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Badge variant="secondary" className="gap-1.5">
            <Users aria-hidden="true" className="size-3" />
            {event.attendeeCount} attending
          </Badge>
          <div className="flex items-center gap-2">
            {isHost ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={cancelState === 'cancelling'}
                aria-busy={cancelState === 'cancelling' ? true : undefined}
                aria-label={`Cancel ${event.title}`}
              >
                {cancelState === 'cancelling' ? 'Cancelling…' : 'Cancel event'}
              </Button>
            ) : null}
            {state === 'confirmed' ? (
              <Button
                type="button"
                variant="secondary"
                disabled
                aria-label={`RSVP confirmed for ${event.title}`}
                className="gap-1.5"
              >
                <Check aria-hidden="true" className="size-4" />
                RSVP’d
              </Button>
            ) : (
              <Button
                type="button"
                variant="default"
                onClick={handleRsvp}
                disabled={state === 'submitting'}
                aria-busy={state === 'submitting' ? true : undefined}
                aria-label={`RSVP to ${event.title}`}
              >
                {state === 'submitting' ? 'RSVPing…' : 'RSVP'}
              </Button>
            )}
          </div>
        </div>
        {state === 'error' ? (
          <p role="alert" className="text-small text-destructive">
            Couldn’t save your RSVP. Try again.
          </p>
        ) : null}
        {cancelState === 'error' ? (
          <p role="alert" className="text-small text-destructive">
            Couldn’t cancel this event. Try again.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
