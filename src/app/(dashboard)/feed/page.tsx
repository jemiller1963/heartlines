// @polsia:user-owned — Matching Feed single-card discovery page.
//
// Client page (DashboardShell redirects unauthenticated visitors). Fetches
// one page from /api/discover/matches on mount, walks through the queue
// one card at a time. Pass posts /api/discover/seen, Connect posts
// /api/discover/connect — both optimistically remove the current card from
// the queue. When the queue empties, refetches with the stored cursor and
// either appends more or transitions to `empty-feed` on another empty page.

'use client';

import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MatchCard } from '@/components/custom/feed/match-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import {
  type ConnectionCreate,
  ConnectionResult as ConnectionResultSchema,
  type DiscoverMatchItem,
  type DiscoverResult,
  DiscoverResult as DiscoverResultSchema,
  type DiscoverSeenCreate,
  DiscoverSeenResult as DiscoverSeenResultSchema,
} from '@/lib/contracts/discover';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'empty-profile' }
  | { kind: 'empty-feed' }
  | { kind: 'ready'; matches: DiscoverMatchItem[]; nextCursor: string | null }
  | { kind: 'error'; message: string };

export default function FeedPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [busyTargets, setBusyTargets] = useState<Set<string>>(new Set());

  const loadPage = useCallback(async (cursor: string | null, replace: boolean) => {
    try {
      const path = cursor
        ? `/api/discover/matches?cursor=${encodeURIComponent(cursor)}`
        : '/api/discover/matches';
      const res = await apiFetch<DiscoverResult>(path, {
        method: 'GET',
        schema: DiscoverResultSchema,
      });
      if (!res.hasProfile) {
        setState({ kind: 'empty-profile' });
        return;
      }
      if (res.matches.length === 0 && replace) {
        setState({ kind: 'empty-feed' });
        return;
      }
      setState((current) => {
        if (replace || current.kind !== 'ready') {
          return { kind: 'ready', matches: res.matches, nextCursor: res.nextCursor };
        }
        return {
          kind: 'ready',
          matches: [...current.matches, ...res.matches],
          nextCursor: res.nextCursor,
        };
      });
    } catch (err) {
      const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
      if (status === '401') {
        // DashboardShell owns the auth-redirect seam; just hold loading state.
        return;
      }
      toast.error('We could not load your matches.');
      setState({ kind: 'error', message: 'We could not load your matches.' });
    }
  }, []);

  useEffect(() => {
    loadPage(null, true);
  }, [loadPage]);

  // Auto-refetch when the queue empties and a cursor still exists.
  useEffect(() => {
    if (state.kind !== 'ready') return;
    if (state.matches.length > 0) return;
    if (!state.nextCursor) return;
    loadPage(state.nextCursor, true);
  }, [loadPage, state]);

  const refreshAfterError = useCallback(() => {
    setState({ kind: 'loading' });
    loadPage(null, true);
  }, [loadPage]);

  const advanceAndRefetch = useCallback((targetId: string) => {
    setState((current) => {
      if (current.kind !== 'ready') return current;
      const remaining = current.matches.filter((m) => m.profile.userId !== targetId);
      return { ...current, matches: remaining };
    });
  }, []);

  const reinsertAtHead = useCallback((match: DiscoverMatchItem) => {
    setState((current) => {
      if (current.kind !== 'ready') {
        return { kind: 'ready', matches: [match], nextCursor: null };
      }
      if (current.matches.some((m) => m.profile.userId === match.profile.userId)) {
        return current;
      }
      return { ...current, matches: [match, ...current.matches] };
    });
  }, []);

  const handlePass = useCallback(
    async (match: DiscoverMatchItem) => {
      const targetId = match.profile.userId;
      if (busyTargets.has(targetId)) return;
      setBusyTargets((prev) => new Set(prev).add(targetId));
      try {
        await apiFetch('/api/discover/seen', {
          method: 'POST',
          body: JSON.stringify({ toUserId: targetId } satisfies DiscoverSeenCreate),
          schema: DiscoverSeenResultSchema,
        });
        advanceAndRefetch(targetId);
      } catch (err) {
        const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
        if (status === '401') return;
        toast.error('Could not record your pass.');
        reinsertAtHead(match);
      } finally {
        setBusyTargets((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }
    },
    [advanceAndRefetch, busyTargets, reinsertAtHead],
  );

  const handleConnect = useCallback(
    async (match: DiscoverMatchItem) => {
      const targetId = match.profile.userId;
      if (busyTargets.has(targetId)) return;
      setBusyTargets((prev) => new Set(prev).add(targetId));
      try {
        await apiFetch('/api/discover/connect', {
          method: 'POST',
          body: JSON.stringify({ toUserId: targetId } satisfies ConnectionCreate),
          schema: ConnectionResultSchema,
        });
        advanceAndRefetch(targetId);
        toast.success(
          `Connection sent to ${match.name.trim() || `${match.profile.age}-year-old`}.`,
        );
      } catch (err) {
        const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
        if (status === '401') return;
        toast.error('Could not record your connection.');
        reinsertAtHead(match);
      } finally {
        setBusyTargets((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
      }
    },
    [advanceAndRefetch, busyTargets, reinsertAtHead],
  );

  const current = state.kind === 'ready' && state.matches.length > 0 ? state.matches[0] : null;
  const totalReady = state.kind === 'ready' ? state.matches.length : 0;
  const position = totalReady > 0 ? 1 : 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-eyebrow">
          <Sparkles aria-hidden="true" className="size-3.5" />
          Today&apos;s matches
        </p>
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 font-bold text-foreground">Your next match</h1>
          <p className="text-body text-muted-foreground">
            Browse one profile at a time. Pass moves on, Connect sends a connection intent — both
            are kept private until they reach the other side.
          </p>
        </div>
        {state.kind === 'ready' && state.matches.length > 0 ? (
          <p className="text-caption text-muted-foreground">
            {position} of {totalReady} remaining
          </p>
        ) : null}
      </header>

      {state.kind === 'loading' ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <Skeleton className="size-16 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <div className="flex gap-2">
            <Skeleton className="h-9 flex-1" />
            <Skeleton className="h-9 flex-1" />
          </div>
        </div>
      ) : null}

      {state.kind === 'empty-profile' ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
          <Sparkles aria-hidden="true" className="size-8 text-brand-600" />
          <h2 className="text-h3 font-semibold text-foreground">Tell us about yourself first</h2>
          <p className="max-w-md text-body text-muted-foreground">
            We need a profile before we can score compatibility. Add your age, city, and interests —
            it takes a minute.
          </p>
          <Button asChild>
            <Link href="/profile">Edit your profile</Link>
          </Button>
        </div>
      ) : null}

      {state.kind === 'empty-feed' ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
          <Sparkles aria-hidden="true" className="size-8 text-brand-500" />
          <h2 className="text-h3 font-semibold text-foreground">You&apos;ve seen everyone new</h2>
          <p className="max-w-md text-body text-muted-foreground">
            Check back later — we add new profiles every day.
          </p>
          <Button variant="outline" onClick={refreshAfterError}>
            Refresh
          </Button>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-12 text-center">
          <h2 className="text-h3 font-semibold text-foreground">{state.message}</h2>
          <Button variant="outline" onClick={refreshAfterError}>
            Retry
          </Button>
        </div>
      ) : null}

      {current ? (
        <MatchCard
          key={current.profile.id}
          match={current}
          busy={busyTargets.has(current.profile.userId)}
          onPass={() => {
            void handlePass(current);
          }}
          onConnect={() => {
            void handleConnect(current);
          }}
        />
      ) : null}
    </div>
  );
}
