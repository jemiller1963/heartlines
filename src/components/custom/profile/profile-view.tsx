// @polsia:user-owned — Profile-viewer island for /profile/[id].
//
// On mount, fetches /api/profile/<targetUserId> via apiFetch and renders the
// basics (avatar, display name, age, location, bio, interests, lifestyle
// preferences). For the signed-in viewer viewing their OWN profile, exposes
// an "Edit profile" button linking to /profile/edit. 404 falls through to a
// soft "Profile unavailable" card.

'use client';

import { Camera, MapPin, UserCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-client';
import { ProfileItem } from '@/lib/contracts/profile';
import { useMountedSession } from '@/lib/use-auth-session';
import { cn } from '@/lib/utils';

interface ProfileViewProps {
  targetUserId: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ProfileItem }
  | { kind: 'missing' }
  | { kind: 'error'; message: string };

function initialsFrom(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed[0] ? trimmed[0].toUpperCase() : '';
}

function extractStatus(err: unknown): string | undefined {
  return (err as Error).message?.match(/\((\d{3})\)/)?.[1];
}

export function ProfileView({ targetUserId }: ProfileViewProps) {
  const { data: session } = useMountedSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    void (async () => {
      try {
        const data = await apiFetch<ProfileItem>(
          `/api/profile/${encodeURIComponent(targetUserId)}`,
          { method: 'GET', schema: ProfileItem },
        );
        if (cancelled) return;
        setState({ kind: 'ready', data });
      } catch (err) {
        if (cancelled) return;
        const status = extractStatus(err);
        if (status === '404') {
          setState({ kind: 'missing' });
          return;
        }
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Could not load this profile.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  const isSelf = session?.user?.id === targetUserId;

  if (state.kind === 'loading') {
    return null;
  }

  if (state.kind === 'missing') {
    return (
      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-h4">Profile unavailable</CardTitle>
          <CardDescription>
            This member hasn&apos;t filled their profile out yet — check back later.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (state.kind === 'error') {
    return (
      <Card className="border-border/70 bg-card shadow-sm" role="alert">
        <CardHeader>
          <CardTitle className="text-h4">Profile unavailable</CardTitle>
          <CardDescription>
            Couldn&apos;t load this member&apos;s profile right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-body text-muted-foreground">{state.message}</p>
        </CardContent>
      </Card>
    );
  }

  const data = state.data;
  const display = data.displayName?.trim() || session?.user?.name || 'Heart Lines member';
  const avatarFallbackInitials = initialsFrom(display);

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex flex-1 flex-wrap items-start gap-5">
          <Avatar className="size-20 border border-border/70 shadow-sm">
            {data.avatarUrl ? <AvatarImage src={data.avatarUrl} alt="Profile photo" /> : null}
            <AvatarFallback className="text-h4 font-semibold bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
              {avatarFallbackInitials || <Camera aria-hidden="true" className="size-7" />}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="text-h3 font-bold text-foreground">{display}</CardTitle>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <UserCircle2 aria-hidden="true" className="size-3.5" />
                {data.age}
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <MapPin aria-hidden="true" className="size-3.5" />
                {data.location}
              </span>
            </div>
            {data.bio ? (
              <p className="mt-2 max-w-prose text-body text-foreground/90">{data.bio}</p>
            ) : null}
          </div>
        </div>
        {isSelf ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/profile/edit">Edit profile</Link>
          </Button>
        ) : null}
      </CardHeader>
      {data.interests.length > 0 || (data.lifestylePreferences ?? []).length > 0 ? (
        <CardContent className="flex flex-col gap-5">
          {data.interests.length > 0 ? (
            <ProfileChips eyebrow="Interests" tokens={data.interests} tone="brand" />
          ) : null}
          {(data.lifestylePreferences ?? []).length > 0 ? (
            <ProfileChips
              eyebrow="Lifestyle preferences"
              tokens={data.lifestylePreferences ?? []}
              tone="muted"
            />
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

interface ProfileChipsProps {
  eyebrow: string;
  tokens: string[];
  tone: 'brand' | 'muted';
}

function ProfileChips({ eyebrow, tokens, tone }: ProfileChipsProps) {
  const visible = tokens.slice(0, 12);
  const remaining = tokens.length - visible.length;
  return (
    <section className="flex flex-col gap-2">
      <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
      <ul className="flex flex-wrap gap-1.5">
        {visible.map((token) => (
          <li
            key={token}
            className={cn(
              'inline-flex items-center rounded-full border px-3 py-1 text-caption font-medium',
              tone === 'brand'
                ? 'border-brand-200 bg-brand-50 text-brand-800 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100'
                : 'border-border bg-secondary text-secondary-foreground',
            )}
          >
            {token}
          </li>
        ))}
        {remaining > 0 ? (
          <li className="self-center text-caption text-muted-foreground">+{remaining} more</li>
        ) : null}
      </ul>
    </section>
  );
}
