// @polsia:user-owned — feed card for one candidate profile.
//
// The profile doesn't carry a display name (no schema field for it yet), so
// the avatar fallback uses the first letter of `location` — the most
// identifying single-attribute on a profile.

'use client';

import { Heart, MapPin, Sparkles, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import type { FeedItem } from '@/lib/contracts/feed';
import { cn } from '@/lib/utils';
import { MatchScoreBadge } from './match-score-badge';

export interface FeedCardProps {
  item: FeedItem;
  onAccept(): void;
  onReject(): void;
  busy?: boolean;
}

function avatarInitial(location: string): string {
  const trimmed = location.trim();
  return (trimmed[0] ?? '?').toUpperCase();
}

export function FeedCard({ item, onAccept, onReject, busy }: FeedCardProps) {
  const { profile, matchScore, sharedInterests } = item;
  const sharedSet = new Set(sharedInterests.map((s) => s.toLowerCase()));
  return (
    <Card
      className={cn(
        'flex flex-col overflow-hidden border-border/70 bg-card shadow-sm',
        'transition-shadow duration-200 hover:shadow-md',
      )}
      aria-busy={busy ? true : undefined}
    >
      <CardHeader className="flex flex-row items-start gap-4 pb-3">
        <Avatar className="size-12 ring-2 ring-brand-100 dark:ring-brand-900/50">
          <AvatarFallback className="bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200 font-semibold">
            {avatarInitial(profile.location)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-body font-semibold text-foreground">{profile.age}-year-old</p>
            <MatchScoreBadge score={matchScore} />
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

        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-eyebrow">
            <Sparkles aria-hidden="true" className="size-3.5 text-brand-600" />
            Interests
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.interests.map((interest) => {
              const isShared = sharedSet.has(interest.toLowerCase());
              return (
                <Badge
                  key={interest}
                  variant={isShared ? 'default' : 'outline'}
                  className={cn(
                    isShared &&
                      'border-brand-300 bg-brand-100 text-brand-800 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-100',
                  )}
                >
                  {interest}
                </Badge>
              );
            })}
          </div>
        </div>
      </CardContent>

      <Separator />

      <CardFooter className="grid grid-cols-2 gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onReject}
          disabled={busy}
          className="w-full"
        >
          <X aria-hidden="true" />
          Pass
        </Button>
        <Button type="button" onClick={onAccept} disabled={busy} className="w-full">
          <Heart aria-hidden="true" />
          Interested
        </Button>
      </CardFooter>
    </Card>
  );
}
