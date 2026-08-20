'use client';

// @polsia:user-owned — admin profile-review queue client island.
//
// Mirrors `verification-review-list.tsx` deliberately: same state machine
// (loading / error / empty / ready), same optimistic-flip + rollback
// pattern (snapshot → mutate → apiFetch → undo on reject), same four render
// branches so the admin queue pages feel like the same tool. Only the
// optimistic target differs — verifications removes the row from the list
// (it's terminal), while profiles KEEPS the row with the new badge (the
// admin still wants to see what they just decided).
//
// Lint contract: no server-only imports — the verify gate's
// `noRestrictedImports` does NOT cover `src/components/**`, but we still keep
// this island free of `@/lib/db`, `next/headers`, `@prisma/client`,
// `server-only`, and `@/lib/auth` so it stays a pure consumer of the
// `/api/admin/profiles` surface.

import { Check, Flag as FlagIcon, ShieldCheck, User } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-client';
import {
  AdminProfileList,
  AdminProfileListItem,
  type AdminProfileListItem as AdminProfileListItemType,
} from '@/lib/contracts/admin';

type State =
  | { status: 'loading' }
  | { status: 'ready'; items: AdminProfileListItemType[] }
  | { status: 'error'; error: string };

export function ProfileReviewList() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/admin/profiles', { schema: AdminProfileList })
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
    async (id: string, action: 'approve' | 'flag') => {
      if (state.status !== 'ready') return;
      const snapshot = state.items;
      // Optimistic flip — keep the row in place but change its badge. If the
      // server rejects the decision we restore the original snapshot below.
      const next: AdminProfileListItemType['reviewStatus'] =
        action === 'approve' ? 'APPROVED' : 'FLAGGED';
      setState({
        status: 'ready',
        items: snapshot.map((it) => (it.id === id ? { ...it, reviewStatus: next } : it)),
      });
      setBusyId(id);
      try {
        await apiFetch(`/api/admin/profiles/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ action }),
          schema: AdminProfileListItem,
        });
        toast.success(action === 'approve' ? 'Approved' : 'Flagged');
      } catch (err) {
        setState({ status: 'ready', items: snapshot });
        const cause = (err as Error & { cause?: { error?: string } }).cause;
        toast.error(cause?.error ?? (err as Error).message);
      } finally {
        setBusyId(null);
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
          <p className="text-sm text-muted-foreground">Loading pending profiles...</p>
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
          <p className="text-sm text-muted-foreground">No profiles waiting for review.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-small text-muted-foreground">
        {state.items.length} pending · showing newest first
      </p>
      <ul className="flex flex-col gap-4">
        {state.items.map((item) => (
          <ProfileRow
            key={item.id}
            item={item}
            disabled={!!busyId}
            isBusiest={busyId === item.id}
            onApprove={() => decide(item.id, 'approve')}
            onFlag={() => decide(item.id, 'flag')}
          />
        ))}
      </ul>
    </div>
  );
}

interface RowProps {
  item: AdminProfileListItemType;
  disabled: boolean;
  isBusiest: boolean;
  onApprove: () => void;
  onFlag: () => void;
}

function ProfileRow({ item, disabled, isBusiest, onApprove, onFlag }: RowProps) {
  return (
    <li>
      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-[72px_minmax(0,1fr)]">
          <AvatarOrFallback item={item} />
          <div className="flex flex-col gap-3">
            <p className="text-eyebrow text-muted-foreground">Profile</p>
            <h3 className="text-h4 text-foreground">{item.displayName ?? 'Unnamed user'}</h3>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Field label="Age" value={String(item.age)} />
              <Field label="City" value={item.city} />
              <Field label="Created" value={new Date(item.createdAt).toLocaleString()} />
              <div className="flex flex-col">
                <dt className="text-eyebrow text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant="secondary">{item.reviewStatus}</Badge>
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
                onClick={onFlag}
                disabled={disabled}
                aria-busy={isBusiest}
                className="min-w-32"
              >
                <FlagIcon aria-hidden="true" />
                {isBusiest ? 'Flagging...' : 'Flag'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-eyebrow text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

function AvatarOrFallback({ item }: { item: AdminProfileListItemType }) {
  const alt = `${item.displayName ?? item.id} avatar`;
  return (
    <div className="flex size-16 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted/40">
      {item.avatarUrl ? (
        <Image
          src={item.avatarUrl}
          alt={alt}
          width={64}
          height={64}
          unoptimized
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <User aria-hidden="true" className="size-7 text-muted-foreground" />
      )}
    </div>
  );
}
