// @polsia:user-owned — Events listing island. Owns the cursor and reads
// `GET /api/events` via the typed `apiFetch` + `EventList` zod contract.
// On 401 the page-level shell already redirects; do nothing extra.
// On any other error the island renders a friendly error card with Retry.
// On an empty first page it renders the icon + heading + body empty state.
//
// Hosts can cancel their own event from a card — the island pulls
// `currentUserId` from `useSession()` and forwards the id plus an
// `onCancelled` filter to each `<EventCard/>` so the cancelled row
// disappears optimistically on a 204.

'use client';

import { CalendarDays } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EventCard } from '@/components/custom/events/event-card';
import { EventsFilterBar } from '@/components/custom/events/events-filter-bar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import { useSession } from '@/lib/auth-client';
import {
  type EventItem,
  type EventList,
  EventList as EventListSchema,
} from '@/lib/contracts/events';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty' }
  | { kind: 'ready'; items: EventItem[]; nextCursor: string | null }
  | { kind: 'loading-more'; items: EventItem[]; nextCursor: string | null }
  | { kind: 'error'; message: string };

const ERROR_MESSAGE = 'Unable to load events.';

function isUnauthorized(err: unknown): boolean {
  const message = err instanceof Error ? err.message : '';
  return /\(401\)/.test(message) || /\(403\)/.test(message);
}

export function EventsList() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [city, setCity] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // `data?.user?.id` is `undefined` while the session resolves and `null`
  // for logged-out visitors. Pass through as a single nullable string.
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;

  const loadPage = useCallback(async (cursor: string | null, replace: boolean) => {
    try {
      const path = cursor ? `/api/events?cursor=${encodeURIComponent(cursor)}` : '/api/events';
      const res = await apiFetch<EventList>(path, {
        method: 'GET',
        schema: EventListSchema,
      });
      setState((current) => {
        if (res.items.length === 0 && replace) {
          return { kind: 'empty' };
        }
        if (replace || current.kind !== 'ready') {
          return { kind: 'ready', items: res.items, nextCursor: res.nextCursor };
        }
        return {
          kind: 'ready',
          items: [...current.items, ...res.items],
          nextCursor: res.nextCursor,
        };
      });
    } catch (err) {
      if (isUnauthorized(err)) {
        // DashboardShell owns the auth-redirect seam; hold loading state silently.
        return;
      }
      setState({ kind: 'error', message: ERROR_MESSAGE });
    }
  }, []);

  useEffect(() => {
    void loadPage(null, true);
  }, [loadPage]);

  const handleLoadMore = useCallback(() => {
    if (state.kind !== 'ready' || !state.nextCursor) return;
    setState({ kind: 'loading-more', items: state.items, nextCursor: state.nextCursor });
    void loadPage(state.nextCursor, false);
  }, [loadPage, state]);

  const refreshAfterError = useCallback(() => {
    setState({ kind: 'loading' });
    void loadPage(null, true);
  }, [loadPage]);

  // Host-only cancel: filter the cancelled id out of local state. Stable
  // identity per-card means we can pass the raw event.id down.
  const handleCancelled = useCallback((id: string) => {
    setState((current) => {
      if (current.kind !== 'ready' && current.kind !== 'loading-more') return current;
      return { ...current, items: current.items.filter((it) => it.id !== id) };
    });
  }, []);

  // Local-day date-range filter against the event's single startTime:
  // rangeStart <= event.startTime <= rangeEnd. `<input type="date">` returns
  // "YYYY-MM-DD"; concat local-time suffixes so the user's calendar pick
  // reads as the same day in their own timezone.
  const visibleItems = useMemo(() => {
    if (state.kind !== 'ready' && state.kind !== 'loading-more') return null;
    const trimmedCity = city.trim().toLowerCase();
    const lower = startDate ? new Date(`${startDate}T00:00:00`) : null;
    const upper = endDate ? new Date(`${endDate}T23:59:59.999`) : null;
    return state.items.filter((it) => {
      if (trimmedCity && !it.city.toLowerCase().includes(trimmedCity)) return false;
      if (lower && new Date(it.startTime) < lower) return false;
      if (upper && new Date(it.startTime) > upper) return false;
      return true;
    });
  }, [state, city, startDate, endDate]);

  const clearFilters = useCallback(() => {
    setCity('');
    setStartDate('');
    setEndDate('');
  }, []);

  const hasActiveFilter = Boolean(city.trim() || startDate || endDate);
  const filteredToZero =
    visibleItems !== null &&
    visibleItems.length === 0 &&
    (state.kind === 'ready' || state.kind === 'loading-more');

  if (state.kind === 'loading') {
    return (
      <div className="grid gap-4 md:grid-cols-2" aria-busy="true">
        {['event-skel-0', 'event-skel-1', 'event-skel-2', 'event-skel-3'].map((key) => (
          <div
            key={key}
            className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-6"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (state.kind === 'empty') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
        <CalendarDays aria-hidden="true" className="size-8 text-brand-500" />
        <h2 className="text-h3 font-semibold text-foreground">No upcoming events</h2>
        <p className="max-w-md text-body text-muted-foreground">
          Check back soon — events are added regularly.
        </p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-12 text-center">
        <h2 className="text-h3 font-semibold text-foreground">{state.message}</h2>
        <Button type="button" variant="outline" onClick={refreshAfterError}>
          Retry
        </Button>
      </div>
    );
  }

  const cursor = state.nextCursor;
  const isLoadingMore = state.kind === 'loading-more';

  return (
    <div className="flex flex-col gap-6">
      <EventsFilterBar
        city={city}
        startDate={startDate}
        endDate={endDate}
        onCityChange={setCity}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onClear={clearFilters}
      />
      <div className="grid gap-4 md:grid-cols-2">
        {(visibleItems ?? state.items).map((event) => (
          <EventCard
            key={event.id}
            event={event}
            currentUserId={currentUserId}
            onCancelled={handleCancelled}
          />
        ))}
        {isLoadingMore
          ? ['event-more-skel-0', 'event-more-skel-1'].map((key) => (
              <div
                key={key}
                className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-6"
                aria-busy="true"
              >
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))
          : null}
      </div>
      {hasActiveFilter && filteredToZero ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <h2 className="text-h3 font-semibold text-foreground">No events match your filters</h2>
          <p className="max-w-md text-body text-muted-foreground">
            Try widening the date range or a different city.
          </p>
          <Button type="button" variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : null}
      {cursor ? (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            disabled={isLoadingMore}
            aria-busy={isLoadingMore ? true : undefined}
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
