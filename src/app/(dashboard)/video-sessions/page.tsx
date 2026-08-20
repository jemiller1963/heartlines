// @polsia:user-owned — `/video-sessions` inbox page (client island). Fetches
// the signed-in user's PENDING video-date requests from
// `GET /api/video-sessions?status=pending` on mount and again whenever the
// window regains focus, then renders one row per session with optimistic
// accept/decline/cancel buttons backed by `PATCH /api/video-sessions/[id]`.
//
// Data plane: NO server-only imports here — every read/write goes through
// `apiFetch` + the shared zod contract. The DashboardShell owns the
// unauthenticated redirect; a 401 from this fetch is swallowed silently so
// the redirect can do its job instead of us toasting noise.
//
// Paywall — joining a video date (`accept`) requires a Premium subscription,
// same as messaging. We load the subscription status alongside the inbox
// and disable the `accept` action for free users by replacing it with an
// inline `<UpgradeCta />`. Decline/cancel stay enabled so the inbox can
// always be cleaned up.

'use client';

import { Sparkles, Video } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { UpgradeCta } from '@/components/custom/billing/upgrade-cta';
import { VideoSessionRow } from '@/components/custom/video-sessions/video-session-row';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import {
  SubscriptionStatus as SubscriptionStatusSchema,
  type SubscriptionStatus as SubscriptionStatusT,
} from '@/lib/contracts/subscription';
import {
  type VideoSessionListItem,
  VideoSessionList as VideoSessionListSchema,
  type VideoSessionPatch,
  VideoSessionResult,
} from '@/lib/contracts/video-sessions';
import { useMountedSession } from '@/lib/use-auth-session';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: VideoSessionListItem[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

interface BootState {
  subscription: SubscriptionStatusT | null;
  hasActiveSubscription: boolean;
}

const ACTION_VERB: Record<VideoSessionPatch['action'], string> = {
  accept: 'Accepted',
  decline: 'Declined',
  cancel: 'Cancelled',
  end: 'Ended',
};

export default function VideoSessionsPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [boot, setBoot] = useState<BootState>({
    subscription: null,
    hasActiveSubscription: false,
  });
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const { data: session } = useMountedSession();
  const viewerId = session?.user?.id ?? null;

  const hasActiveSubscription = boot.hasActiveSubscription;

  const loadSessions = useCallback(async (showLoading: boolean) => {
    if (showLoading) {
      setState({ kind: 'loading' });
    }
    try {
      // Inbox + subscription both load in parallel; paywall gates reading
      // the rows, not listing them (free users can browse their inbox).
      const [data, subscription] = await Promise.all([
        apiFetch('/api/video-sessions?status=pending', {
          method: 'GET',
          schema: VideoSessionListSchema,
        }),
        apiFetch<SubscriptionStatusT>('/api/subscription', {
          method: 'GET',
          schema: SubscriptionStatusSchema,
        }).catch(() => null),
      ]);
      setBoot({ subscription, hasActiveSubscription: subscription?.active === true });
      if (data.items.length === 0) {
        setState({ kind: 'empty' });
        return;
      }
      setState({ kind: 'ready', items: data.items });
    } catch (err) {
      const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
      if (status === '401') {
        // DashboardShell owns the redirect — stay in a quiet loading state.
        return;
      }
      const message = 'We could not load your video date requests.';
      toast.error(message);
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void loadSessions(true);
  }, [loadSessions]);

  // Refresh on focus — a brand-new inbound request lands the moment the
  // user alt-tabs back to the tab. Mirror the focus pattern from `/messages`.
  useEffect(() => {
    const onFocus = () => {
      void loadSessions(false);
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, [loadSessions]);

  const refresh = useCallback(() => {
    void loadSessions(true);
  }, [loadSessions]);

  const handleAction = useCallback(
    async (id: string, action: VideoSessionPatch['action']) => {
      if (state.kind !== 'ready') return;
      if (busyIds.has(id)) return;

      const snapshot = state.items;
      setState({ kind: 'ready', items: snapshot.filter((it) => it.id !== id) });
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      try {
        await apiFetch(`/api/video-sessions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
          schema: VideoSessionResult,
        });
        toast.success(ACTION_VERB[action]);
      } catch (err) {
        const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
        // 402 from the paywall on `accept` — roll back the optimistic
        // removal so the row re-appears (the row component already
        // shows the UpgradeCta there for free users, so re-embedding
        // the row keeps the inline upgrade CTA visible).
        if (status === '402') {
          setState({ kind: 'ready', items: snapshot });
          setBoot((prev) => ({
            subscription: prev.subscription ?? {
              active: false,
              currentPeriodEnd: null,
              plan: null,
            },
            hasActiveSubscription: false,
          }));
          const cause = (err as Error & { cause?: { message?: string } }).cause;
          toast.error(
            cause?.message ?? 'Upgrade to Premium to join video dates with your matches.',
          );
          setBusyIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          return;
        }
        // Rollback the optimistic removal so the row re-appears.
        setState({ kind: 'ready', items: snapshot });
        const cause = (err as Error & { cause?: { errors?: Record<string, string> } }).cause;
        const fieldError = cause?.errors?.action;
        toast.error(fieldError ?? (err as Error).message);
      } finally {
        setBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [busyIds, state],
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-eyebrow">
          <Video aria-hidden="true" className="size-3.5" />
          Video dates
        </p>
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 font-bold text-foreground">Pending requests</h1>
          <p className="text-body text-muted-foreground">
            When you and a match both want a video date, the request lands here. Accept to open the
            call, decline to pass, or cancel your own invite.
          </p>
        </div>
      </header>

      {hasActiveSubscription ? null : (
        <output
          aria-live="polite"
          className="flex flex-col gap-3 rounded-2xl border border-brand-500/40 bg-brand-50 px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <div className="flex flex-col gap-0.5">
              <p className="text-body font-medium text-foreground">
                Premium is required to join a video date
              </p>
              <p className="text-caption text-muted-foreground">
                You can still decline or cancel invites below. Upgrade on the row to accept an
                incoming one.
              </p>
            </div>
          </div>
          <UpgradeCta size="sm" reason="video" label="Upgrade — $25 / month" />
        </output>
      )}

      {state.kind === 'loading' ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          {(['a', 'b', 'c', 'd', 'e'] as const).map((slot) => (
            <div key={slot} className="flex items-start gap-4">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-40" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {state.kind === 'empty' ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
          <Video aria-hidden="true" className="size-8 text-brand-500" />
          <h2 className="text-h3 font-semibold text-foreground">No pending requests</h2>
          <p className="max-w-md text-body text-muted-foreground">
            A new invite from a match shows up here. Pull from Discover to keep things moving.
          </p>
          <Button variant="outline" onClick={refresh}>
            Refresh
          </Button>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-12 text-center">
          <Video aria-hidden="true" className="size-8 text-destructive" />
          <h2 className="text-h3 font-semibold text-foreground">{state.message}</h2>
          <Button variant="outline" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <ul className="flex flex-col gap-2">
          {state.items.map((session) => (
            <VideoSessionRow
              key={session.id}
              session={session}
              viewerId={viewerId}
              busy={busyIds.has(session.id)}
              hasActiveSubscription={hasActiveSubscription}
              onAccept={(id) => handleAction(id, 'accept')}
              onDecline={(id) => handleAction(id, 'decline')}
              onCancel={(id) => handleAction(id, 'cancel')}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
