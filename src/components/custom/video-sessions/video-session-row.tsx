// Purely presentational tile for the `/video-sessions` inbox. Imported only
// by the client-island page, so it has no `'use client'` directive and no
// server-only imports of its own. The viewer-aware direction chip is derived
// HERE (via the `viewerId` prop) so the row stays a stateless pure-function
// component and the page owns the wire-up of accept/decline/cancel + the
// optimistic-update state machine.
//
// Paywall — when the viewer is NOT subscribed (`hasActiveSubscription` is
// `false`) the row swaps the Accept button for an inline upgrade CTA so the
// free user has a one-click path to Stripe checkout. Decline/Cancel stay
// enabled per the brief (clean-up must always be possible for free users).

import { Check, Loader2, Video, X } from 'lucide-react';
import { UpgradeCta } from '@/components/custom/billing/upgrade-cta';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { OtherParticipantSummary, VideoSessionListItem } from '@/lib/contracts/video-sessions';

const RELATIVE_FORMAT = new Intl.RelativeTimeFormat('en', { numeric: 'always' });
const ABSOLUTE_FORMAT = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' });

function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const diffMs = date.getTime() - now.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return 'just now';
  if (absSec < 60 * 60) return RELATIVE_FORMAT.format(Math.round(diffSec / 60), 'minute');
  if (absSec < 60 * 60 * 24) return RELATIVE_FORMAT.format(Math.round(diffSec / (60 * 60)), 'hour');
  if (absSec < 60 * 60 * 24 * 7) {
    return RELATIVE_FORMAT.format(Math.round(diffSec / (60 * 60 * 24)), 'day');
  }
  return ABSOLUTE_FORMAT.format(date);
}

function pickInitial(participant: OtherParticipantSummary): string {
  const trimmed = participant.name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : '?';
}

function formatSecondaryLine(participant: OtherParticipantSummary): string | null {
  const agePart = participant.age !== null ? String(participant.age) : null;
  const cityPart = participant.city.trim().length > 0 ? participant.city : null;
  if (agePart === null && cityPart === null) return null;
  return `${agePart ?? '—'} · ${cityPart ?? '—'}`;
}

export type VideoSessionRowProps = {
  session: VideoSessionListItem;
  viewerId: string | null;
  busy: boolean;
  /**
   * Subscription status of the viewer — drives the Accept-button shape.
   * Defaults to `true` so consuming places that don't yet know the status
   * keep rendering the Accept button (and the underlying 402 toast on
   * click). Pass `false` to render the inline `<UpgradeCta />` instead.
   */
  hasActiveSubscription?: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onCancel: (id: string) => void;
};

export function VideoSessionRow({
  session,
  viewerId,
  busy,
  hasActiveSubscription = true,
  onAccept,
  onDecline,
  onCancel,
}: VideoSessionRowProps) {
  // The viewer's `senderId` vs the row's `senderId` decides which verb is
  // live. Both sides render with the full affordance set so the row rhythm
  // matches across Incoming and Outgoing; disabled counterparts carry `title`
  // hints instead of disappearing, so the layout stays the same shape.
  const outgoing = viewerId !== null && session.senderId === viewerId;
  const participant = session.otherParticipant;
  const name = participant && participant.name.trim().length > 0 ? participant.name : '—';
  const secondary = participant ? formatSecondaryLine(participant) : null;
  const timestampLabel = formatRelativeTime(session.createdAt);

  return (
    <li className="flex items-start gap-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <Avatar className="size-14">
        {participant?.avatarUrl ? (
          <AvatarImage src={participant.avatarUrl} alt={`${name}'s avatar`} />
        ) : null}
        <AvatarFallback className="text-caption font-medium text-muted-foreground">
          {participant ? pickInitial(participant) : '?'}
        </AvatarFallback>
      </Avatar>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="truncate text-body font-medium text-foreground">{name}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={outgoing ? 'secondary' : 'default'}
              className="border-brand-500/40"
              aria-label={outgoing ? 'Outgoing video date request' : 'Incoming video date request'}
            >
              <Video aria-hidden="true" className="mr-1 size-3" />
              {outgoing ? 'Outgoing' : 'Incoming'}
            </Badge>
            <p className="text-caption text-muted-foreground">{timestampLabel}</p>
          </div>
        </div>
        {secondary !== null ? (
          <p className="truncate text-caption text-muted-foreground">{secondary}</p>
        ) : null}
        <p className="truncate text-caption text-muted-foreground">
          {outgoing
            ? `You invited ${name} to a video date.`
            : `${name} invited you to a video date.`}
        </p>

        <div className="mt-3 flex flex-wrap gap-2" data-busy={busy ? 'true' : 'false'}>
          {/* Paywall: when the viewer is free AND the session is incoming
              (Accept would have been enabled), swap the Accept button for
              an inline UpgradeCta so the user has a one-click path to
              Stripe checkout. Decline / Cancel stay enabled so the inbox
              can always be cleaned up — a free user must never be
              locked out of their own invites. */}
          {!hasActiveSubscription && !outgoing ? (
            <UpgradeCta size="sm" reason="video" label="Upgrade to join" />
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => onAccept(session.id)}
              disabled={busy || outgoing}
              aria-busy={busy}
              title={
                outgoing
                  ? 'You invited this session — accept/decline are reserved for the recipient'
                  : 'Accept the video date'
              }
            >
              <Check aria-hidden="true" />
              Accept
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDecline(session.id)}
            disabled={busy || outgoing}
            aria-busy={busy}
            title={
              outgoing
                ? 'You invited this session — accept/decline are reserved for the recipient'
                : 'Decline the video date'
            }
          >
            <X aria-hidden="true" />
            Decline
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => onCancel(session.id)}
            disabled={busy || !outgoing}
            aria-busy={busy}
            title={outgoing ? 'Cancel your invitation' : 'Cancel is reserved for the inviter'}
          >
            {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
            Cancel
          </Button>
        </div>
      </div>
    </li>
  );
}
