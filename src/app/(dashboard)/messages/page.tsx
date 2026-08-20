// @polsia:user-owned — `/messages` inbox page (client island). Fetches the
// signed-in user's thread list from `GET /api/messages/threads` on mount and
// renders one row per thread. The DashboardShell owns the unauthenticated
// redirect; a 401 from this fetch is swallowed silently so the redirect
// can do its job instead of us toasting noise.
//
// Data plane: NO server-only imports here — the page reads via
// `apiFetch` + the shared zod contract. The schema is imported with a
// `Schema` suffix to avoid shadowing the inferred type.

'use client';

import { Mail } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ThreadRow } from '@/components/custom/messages/thread-row';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import {
  type MessageThreadSummary,
  MessageThreadsList as MessageThreadsListSchema,
} from '@/lib/contracts/messages';
import { useMountedSession } from '@/lib/use-auth-session';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; threads: MessageThreadSummary[] }
  | { kind: 'empty' }
  | { kind: 'error'; message: string };

export default function MessagesPage() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const { data: session } = useMountedSession();
  const viewerId = session?.user?.id ?? null;

  const loadThreads = useCallback(async () => {
    try {
      const data = await apiFetch('/api/messages/threads', {
        method: 'GET',
        schema: MessageThreadsListSchema,
      });
      if (data.items.length === 0) {
        setState({ kind: 'empty' });
        return;
      }
      setState({ kind: 'ready', threads: data.items });
    } catch (err) {
      const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
      if (status === '401') {
        // DashboardShell owns the redirect — stay in a quiet loading state.
        return;
      }
      const message = 'We could not load your messages.';
      toast.error(message);
      setState({ kind: 'error', message });
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const refresh = useCallback(() => {
    setState({ kind: 'loading' });
    void loadThreads();
  }, [loadThreads]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-eyebrow">
          <Mail aria-hidden="true" className="size-3.5" />
          Messages
        </p>
        <div className="flex flex-col gap-1">
          <h1 className="text-h2 font-bold text-foreground">Conversations</h1>
          <p className="text-body text-muted-foreground">
            Threads you&apos;ve started with your matches. Open one to keep the conversation going.
          </p>
        </div>
      </header>

      {state.kind === 'loading' ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          {(['a', 'b', 'c', 'd', 'e'] as const).map((slot) => (
            <div key={slot} className="flex items-start gap-4">
              <Skeleton className="size-14 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-3 w-12" />
            </div>
          ))}
        </div>
      ) : null}

      {state.kind === 'empty' ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-12 text-center">
          <Mail aria-hidden="true" className="size-8 text-brand-500" />
          <h2 className="text-h3 font-semibold text-foreground">No conversations yet</h2>
          <p className="max-w-md text-body text-muted-foreground">
            Matches you&apos;ve started appear here. Keep browsing — the first one is always the
            hardest.
          </p>
          <Button variant="outline" onClick={refresh}>
            Refresh
          </Button>
        </div>
      ) : null}

      {state.kind === 'error' ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-12 text-center">
          <Mail aria-hidden="true" className="size-8 text-destructive" />
          <h2 className="text-h3 font-semibold text-foreground">{state.message}</h2>
          <Button variant="outline" onClick={refresh}>
            Retry
          </Button>
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <div className="flex flex-col gap-2">
          {state.threads.map((thread) => (
            <ThreadRow key={thread.id} thread={thread} viewerId={viewerId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
