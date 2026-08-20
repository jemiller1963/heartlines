'use client';

import { ShieldOff, UserMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/api-client';
import type { BlockDeleteResult, BlockListEnvelope, BlockListItem } from '@/lib/contracts/blocks';
import {
  BlockDeleteResult as BlockDeleteResultSchema,
  BlockListEnvelope as BlockListEnvelopeSchema,
} from '@/lib/contracts/blocks';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; items: BlockListItem[] }
  | { kind: 'empty' }
  | { kind: 'error' };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function displayName(item: BlockListItem): string {
  const trimmed = item.blockedName?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : 'A Heart Lines member';
}

export function BlocksList() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const env = await apiFetch<BlockListEnvelope>('/api/blocks', {
          method: 'GET',
          schema: BlockListEnvelopeSchema,
        });
        if (cancelled) return;
        setState(env.items.length === 0 ? { kind: 'empty' } : { kind: 'ready', items: env.items });
      } catch {
        if (cancelled) return;
        setState({ kind: 'error' });
        toast.error('Could not load your blocked members');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUnblock = async (item: BlockListItem) => {
    if (busyId) return;
    setBusyId(item.id);
    // Optimistic remove — reinsert if the server rejects so the list stays
    // consistent with what the server has actually recorded.
    setState((current) => {
      if (current.kind !== 'ready') return current;
      return { kind: 'ready', items: current.items.filter((i) => i.id !== item.id) };
    });
    try {
      const result = await apiFetch<BlockDeleteResult>('/api/blocks', {
        method: 'DELETE',
        body: JSON.stringify({ blockedId: item.blockedId }),
        schema: BlockDeleteResultSchema,
      });
      if (result.blockedId !== item.blockedId) {
        // Defensive — server should echo the same id, but trust it anyway.
        toast.success('Member unblocked');
      } else {
        toast.success(`${displayName(item)} can reach you again.`);
      }
    } catch {
      setState((current) => {
        if (current.kind !== 'ready') return current;
        if (current.items.some((i) => i.id === item.id)) return current;
        return { kind: 'ready', items: [item, ...current.items] };
      });
      toast.error('Could not unblock that member');
    } finally {
      setBusyId(null);
    }
  };

  const reload = () => {
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const env = await apiFetch<BlockListEnvelope>('/api/blocks', {
          method: 'GET',
          schema: BlockListEnvelopeSchema,
        });
        setState(env.items.length === 0 ? { kind: 'empty' } : { kind: 'ready', items: env.items });
      } catch {
        setState({ kind: 'error' });
        toast.error('Could not load your blocked members');
      }
    })();
  };

  if (state.kind === 'loading') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Blocked members</CardTitle>
          <CardDescription>Loading your blocked list…</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (state.kind === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Blocked members</CardTitle>
          <CardDescription>
            We couldn’t load your blocked list. Refresh to try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="outline" onClick={reload}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === 'empty') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldOff aria-hidden="true" className="size-4 text-brand-500" />
            Nobody is blocked
          </CardTitle>
          <CardDescription>
            You haven&apos;t blocked anyone on Heart Lines yet. Hidden members are listed here so
            you can manage them later.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserMinus aria-hidden="true" className="size-4 text-brand-500" />
          {state.items.length} blocked {state.items.length === 1 ? 'member' : 'members'}
        </CardTitle>
        <CardDescription>
          Unblock a member to make them visible in your feed and able to message you again.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="grid gap-0 p-0">
        <ul className="grid gap-0">
          {state.items.map((item, idx) => (
            <li
              key={item.id}
              className={
                idx === 0
                  ? 'flex items-center justify-between gap-4 px-6 py-4'
                  : 'flex items-center justify-between gap-4 border-t border-border/70 px-6 py-4'
              }
            >
              <div className="grid gap-0.5">
                <p className="text-base font-medium text-foreground">{displayName(item)}</p>
                <p className="text-xs text-muted-foreground">
                  Blocked {formatWhen(item.createdAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId === item.id}
                onClick={() => {
                  void handleUnblock(item);
                }}
              >
                {busyId === item.id ? 'Unblocking…' : 'Unblock'}
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
