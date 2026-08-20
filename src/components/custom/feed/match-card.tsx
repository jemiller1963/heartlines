// @polsia:user-owned — Single-card-at-a-time discovery card.
//
// Wraps a `DiscoverMatchItem` candidate in a Card with avatar, name + age,
// location, optional bio, shared-interest chips, a "Starter ideas" AI-card
// island, and a Pass / Connect button tray. Pure presentation: read props,
// dispatch callbacks. Reuses `Avatar` / `AvatarImage` / `AvatarFallback`
// from `@/components/ui/avatar` — NOT `profile-avatar` (which is the upload
// control, would expose swipe-novel actions on the discovery page).

'use client';

import { Check, ClipboardCopy, HeartHandshake, MapPin, Sparkles, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { apiFetch } from '@/lib/api-client';
import {
  type ConversationStartersRequest,
  type ConversationStartersResult,
  ConversationStartersResult as ConversationStartersResultSchema,
  type DiscoverMatchItem,
} from '@/lib/contracts/discover';
import { cn } from '@/lib/utils';
import { MatchScoreBadge } from '../match-score-badge';

export interface MatchCardProps {
  match: DiscoverMatchItem;
  onPass(): void;
  onConnect(): void;
  busy?: boolean;
}

function avatarInitial(name: string, fallback: string): string {
  const trimmed = name.trim();
  if (trimmed[0]) return trimmed[0].toUpperCase();
  const fallbackChar = fallback.trim()[0] ?? '?';
  return fallbackChar.toUpperCase();
}

// Hard-coded neutral openers used when the server returns reason="fallback"
// (AI errored / parse failed) — keeps the card useful when the API is flaky.
// `appendAnnounce` is the aria-live target inside the card and updated as a
// transcribed announce ("Copied: ...") for screen readers.
const NEUTRAL_OPENERS = [
  'Hi! What kind of weekend are you most excited about right now?',
  'Hey — what has been the highlight of your week so far?',
  'Hi there! Is there a song, podcast, or show you keep coming back to?',
];

type StartersState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; starters: string[] };

function StartersIsland({
  match,
  disabled,
  disabledReason,
}: {
  match: DiscoverMatchItem;
  disabled: boolean;
  disabledReason?: string;
}) {
  const [state, setState] = useState<StartersState>({ status: 'idle' });
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [announce, setAnnounce] = useState<string>('');
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const targetUserId = match.profile.userId;

  useEffect(() => {
    return () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    };
  }, []);

  const load = async () => {
    if (state.status === 'loading') return;
    setState({ status: 'loading' });
    try {
      const body: ConversationStartersRequest = { toUserId: targetUserId };
      const result = await apiFetch<ConversationStartersResult>(
        '/api/discover/conversationstarters',
        {
          method: 'POST',
          body: JSON.stringify(body),
          schema: ConversationStartersResultSchema,
        },
      );
      setState({ status: 'ready', starters: result.starters });
    } catch {
      // No retry storm — the route itself already tried and (per spec) never
      // 5xx's. A failure here is "request never reached us" / 401; either way
      // we ship the client's neutral openers so the card remains usable.
      setState({ status: 'ready', starters: NEUTRAL_OPENERS });
    }
  };

  const copyStarter = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error('Could not copy to clipboard.');
      return;
    }
    setCopiedIndex(index);
    setAnnounce(`Copied: ${text}`);
    toast.success('Copied to clipboard');
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopiedIndex(null), 1200);
  };

  const startersButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        void load();
      }}
      disabled={disabled || state.status === 'loading'}
      aria-label="Starter ideas"
      className="self-start"
    >
      <Sparkles aria-hidden="true" />
      {state.status === 'loading' ? 'Thinking…' : 'Starter ideas'}
    </Button>
  );

  return (
    <div className="flex flex-col gap-2">
      {disabled && disabledReason ? (
        <Tooltip>
          <TooltipTrigger asChild>{startersButton}</TooltipTrigger>
          <TooltipContent>{disabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        startersButton
      )}

      {state.status === 'loading' ? (
        <div className="flex flex-wrap gap-1.5" aria-busy="true">
          <Skeleton key="starter-skel-1" className="h-9 w-56 rounded-full" />
          <Skeleton key="starter-skel-2" className="h-9 w-56 rounded-full" />
          <Skeleton key="starter-skel-3" className="h-9 w-56 rounded-full" />
        </div>
      ) : null}

      {state.status === 'ready' ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {state.starters.map((starter, index) => {
              const isCopied = copiedIndex === index;
              return (
                <Button
                  key={starter}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void copyStarter(starter, index);
                  }}
                  className={cn(
                    'max-w-full whitespace-normal break-words text-left font-normal',
                    'transition-colors duration-200',
                    isCopied && 'border-brand-500 bg-brand-100/80 dark:bg-brand-900/40',
                  )}
                  aria-label={`Copy starter: ${starter}`}
                >
                  {isCopied ? (
                    <Check aria-hidden="true" className="text-brand-600" />
                  ) : (
                    <ClipboardCopy aria-hidden="true" />
                  )}
                  <span className="truncate">{starter}</span>
                </Button>
              );
            })}
          </div>
          <output className="sr-only" aria-live="polite">
            {announce}
          </output>
        </div>
      ) : null}
    </div>
  );
}

export function MatchCard({ match, onPass, onConnect, busy }: MatchCardProps) {
  const { profile, name, score, sharedInterests } = match;
  const initial = avatarInitial(name, profile.location);
  const displayName = name.trim() || `${profile.age}-year-old`;
  const hasOverlap = sharedInterests.length > 0;
  return (
    <Card
      className={cn(
        'flex flex-col overflow-hidden border-border/70 bg-card shadow-sm',
        'transition-shadow duration-200 hover:shadow-md',
      )}
      aria-busy={busy ? true : undefined}
    >
      <CardHeader className="flex flex-row items-start gap-4 pb-3">
        <Avatar className="size-16 ring-2 ring-brand-100 dark:ring-brand-900/50">
          {profile.avatarUrl ? (
            <AvatarImage src={profile.avatarUrl} alt={name.trim() || 'Match avatar'} />
          ) : null}
          <AvatarFallback className="bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200 font-semibold">
            {initial}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-body font-semibold text-foreground">
              {displayName}
              <span className="text-muted-foreground"> · {profile.age}</span>
            </p>
            <MatchScoreBadge score={score} />
          </div>
          <p className="flex items-center gap-1.5 text-small text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3.5" />
            {profile.location}
          </p>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex flex-col gap-4 py-4">
        {profile.bio ? (
          <p className="text-body text-foreground/90">{profile.bio}</p>
        ) : (
          <p className="text-small italic text-muted-foreground">
            No bio yet — but you already share {sharedInterests.length} interest
            {sharedInterests.length === 1 ? '' : 's'}.
          </p>
        )}

        {hasOverlap ? (
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-eyebrow">
              <Sparkles aria-hidden="true" className="size-3.5 text-brand-600" />
              Shared interests
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sharedInterests.map((interest) => (
                <Badge
                  key={interest}
                  variant="default"
                  className="border-brand-300 bg-brand-100 text-brand-800 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
                >
                  {interest}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-eyebrow">
            <Sparkles aria-hidden="true" className="size-3.5 text-brand-600" />
            Starter ideas
          </p>
          <StartersIsland
            match={match}
            disabled={!hasOverlap}
            disabledReason={
              hasOverlap ? undefined : 'Add an interest in common first to get tailored starters.'
            }
          />
        </div>
      </CardContent>

      <Separator />

      <CardFooter className="grid grid-cols-2 gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onPass} disabled={busy} className="w-full">
          <X aria-hidden="true" />
          Pass
        </Button>
        <Button type="button" onClick={onConnect} disabled={busy} className="w-full">
          <HeartHandshake aria-hidden="true" />
          Connect
        </Button>
      </CardFooter>
    </Card>
  );
}
