// Purely presentational tile for the `/messages` thread list. Imported only
// by the client island page, so it has no `'use client'` directive and no
// server-only imports of its own. The viewer-id-aware "You: " prefix is
// passed in as a prop so this row stays a stateless pure-function component.

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { MessageThreadSummary, OtherParticipantSummary } from '@/lib/contracts/messages';

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

export type ThreadRowProps = {
  thread: MessageThreadSummary;
  viewerId: string | null;
};

export function ThreadRow({ thread, viewerId }: ThreadRowProps) {
  const timestampLabel = formatRelativeTime(thread.lastMessageAt);
  const name = thread.otherParticipant.name.trim().length > 0 ? thread.otherParticipant.name : '—';
  const secondary = formatSecondaryLine(thread.otherParticipant);

  const previewBody = thread.lastMessage?.body ?? '—';
  const viewerAuthoredPeerLast = viewerId !== null && thread.lastMessage?.senderId === viewerId;
  const previewLabel =
    thread.lastMessage === null
      ? previewBody
      : viewerAuthoredPeerLast
        ? `You: ${previewBody}`
        : previewBody;

  const ariaLabel = `Open conversation with ${name}, last message ${timestampLabel}`;

  return (
    <Link
      href={`/messages/${thread.id}`}
      aria-label={ariaLabel}
      className="flex items-start gap-4 rounded-xl border border-border/70 bg-card p-4 transition-colors hover:bg-secondary/70"
    >
      <Avatar className="size-14">
        {thread.otherParticipant.avatarUrl ? (
          <AvatarImage src={thread.otherParticipant.avatarUrl} alt={`${name}'s avatar`} />
        ) : null}
        <AvatarFallback className="text-caption font-medium text-muted-foreground">
          {pickInitial(thread.otherParticipant)}
        </AvatarFallback>
      </Avatar>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-body font-medium text-foreground">{name}</p>
          <p className="shrink-0 text-caption text-muted-foreground">{timestampLabel}</p>
        </div>
        <p className="truncate text-caption text-muted-foreground">{previewLabel}</p>
        {secondary !== null ? (
          <p className="truncate text-caption text-muted-foreground">{secondary}</p>
        ) : null}
      </div>
    </Link>
  );
}
