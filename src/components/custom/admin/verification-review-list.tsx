'use client';

import { Check, ShieldCheck, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-client';
import {
  AdminVerificationItem,
  type AdminVerificationItem as AdminVerificationItemType,
  AdminVerificationList,
} from '@/lib/contracts/admin-verification';

type State =
  | { status: 'loading' }
  | { status: 'ready'; items: AdminVerificationItemType[] }
  | { status: 'error'; error: string };

export function VerificationReviewList() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/admin/verifications', { schema: AdminVerificationList })
      .then((res) => {
        if (cancelled) return;
        setState({ status: 'ready', items: res.items });
      })
      .catch((err: Error & { cause?: unknown }) => {
        if (cancelled) return;
        const cause = err.cause as { error?: string } | null;
        setState({ status: 'error', error: cause?.error ?? err.message });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const decide = useCallback(
    async (userId: string, action: 'approve' | 'reject') => {
      if (state.status !== 'ready') return;
      const snapshot = state.items;
      const verb = action === 'approve' ? 'Approved' : 'Rejected';
      setState({ status: 'ready', items: snapshot.filter((row) => row.userId !== userId) });
      setBusyUserId(userId);
      try {
        // Body is validated server-side; we don't care about the parsed return —
        // we already removed the row optimistically.
        await apiFetch(`/api/admin/verifications/${userId}`, {
          method: 'POST',
          body: JSON.stringify({ action }),
          schema: AdminVerificationItem,
        });
        toast.success(verb);
      } catch (err) {
        // Roll back the optimistic remove on any failure (network or 409).
        setState({ status: 'ready', items: snapshot });
        const cause = (err as Error & { cause?: { error?: string } }).cause;
        const message =
          action === 'approve' && cause?.error === 'Already reviewed'
            ? 'Already reviewed'
            : action === 'reject' && cause?.error === 'Already reviewed'
              ? 'Already reviewed'
              : ((cause?.error as string | undefined) ?? (err as Error).message);
        toast.error(message);
      } finally {
        setBusyUserId(null);
        router.refresh();
      }
    },
    [router, state],
  );

  if (state.status === 'loading') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ShieldCheck aria-hidden="true" className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading pending verifications...</p>
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <p className="text-base font-semibold text-destructive">Couldn't load the queue</p>
          <p className="text-sm text-muted-foreground">{state.error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setState({ status: 'loading' })}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Check aria-hidden="true" className="size-6 text-brand-500" />
          <p className="text-base font-semibold text-foreground">Queue is clear</p>
          <p className="text-sm text-muted-foreground">No pending verifications to review.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-muted-foreground">
        {state.items.length} pending · showing oldest first
      </p>
      <ul className="flex flex-col gap-4">
        {state.items.map((item) => (
          <VerificationRow
            key={item.userId}
            item={item}
            disabled={!!busyUserId}
            isBusiest={busyUserId === item.userId}
            onApprove={() => decide(item.userId, 'approve')}
            onReject={() => decide(item.userId, 'reject')}
          />
        ))}
      </ul>
    </div>
  );
}

interface RowProps {
  item: AdminVerificationItemType;
  disabled: boolean;
  isBusiest: boolean;
  onApprove: () => void;
  onReject: () => void;
}

function VerificationRow({ item, disabled, isBusiest, onApprove, onReject }: RowProps) {
  return (
    <li>
      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 p-6 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <p className="text-eyebrow text-muted-foreground">Government ID</p>
            <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/40">
              <Image
                src={item.imagePath}
                alt={`ID for ${item.name ?? item.userId}`}
                width={220}
                height={320}
                className="h-64 w-full object-contain"
              />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-eyebrow text-muted-foreground">Submission</p>
              <p className="text-h4 text-foreground">{item.name ?? 'Unnamed user'}</p>
              <p className="text-sm text-muted-foreground">{item.email ?? 'No email on file'}</p>
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="flex flex-col">
                <dt className="text-eyebrow text-muted-foreground">Age</dt>
                <dd className="text-foreground">{item.age}</dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-eyebrow text-muted-foreground">Location</dt>
                <dd className="text-foreground">{item.location}</dd>
              </div>
              <div className="col-span-2 flex flex-col">
                <dt className="text-eyebrow text-muted-foreground">Submitted</dt>
                <dd className="text-foreground">{new Date(item.submittedAt).toLocaleString()}</dd>
              </div>
              <div className="col-span-2 flex flex-col">
                <dt className="text-eyebrow text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant="secondary">{item.status}</Badge>
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="button"
                onClick={onApprove}
                disabled={disabled}
                aria-busy={isBusiest}
                className="min-w-32"
              >
                <Check aria-hidden="true" />
                {isBusiest ? 'Approving...' : 'Approve'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onReject}
                disabled={disabled}
                aria-busy={isBusiest}
                className="min-w-32"
              >
                <X aria-hidden="true" />
                {isBusiest ? 'Rejecting...' : 'Reject'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}
