// @polsia:user-owned — small subscription badge that fetches
// `/api/subscription` on mount and renders "Free" or "Premium · renews D".
// Used in the dashboard shell header next to the user's email so a free user
// sees the badge the moment they sign in.

'use client';

import { Crown, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api-client';
import {
  SubscriptionStatus as SubscriptionStatusSchema,
  type SubscriptionStatus as SubscriptionStatusT,
} from '@/lib/contracts/subscription';
import { cn } from '@/lib/utils';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; status: SubscriptionStatusT }
  | { kind: 'error' };

function formatRenewDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SubscriptionStatusBadge({ className }: { className?: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await apiFetch<SubscriptionStatusT>('/api/subscription', {
          method: 'GET',
          schema: SubscriptionStatusSchema,
        });
        if (!cancelled) setState({ kind: 'ready', status });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === 'loading') {
    return (
      <Badge
        variant="secondary"
        className={cn('gap-1 border-border/70', className)}
        aria-label="Loading subscription status"
      >
        <Loader2 aria-hidden="true" className="size-3 animate-spin" />
        Checking…
      </Badge>
    );
  }

  if (state.kind === 'error') {
    // Fail closed-and-quiet: don't render a misleading "Free" badge when we
    // genuinely don't know. Treating the row as absent is honest.
    return null;
  }

  if (state.status.active) {
    const renewLabel = formatRenewDate(state.status.currentPeriodEnd);
    return (
      <Badge
        variant="default"
        className={cn('gap-1 border-brand-500/40 bg-brand-500/10 text-brand-700', className)}
        aria-label={renewLabel ? `Premium plan, renews ${renewLabel}` : 'Premium plan'}
      >
        <Crown aria-hidden="true" className="size-3" />
        Premium{renewLabel ? ` · renews ${renewLabel}` : ''}
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn('gap-1 border-border/70 text-muted-foreground', className)}
      aria-label="Free plan"
    >
      Free
    </Badge>
  );
}
