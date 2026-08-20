// @polsia:user-owned — pure-function header for the in-app conversation
// page (`/messages/[threadId]`). Renders the other participant's avatar,
// name, and the secondary "age · city" line alongside a back link to
// the inbox. Stateless: all data flows in as props.
//
// The helper functions `pickInitial` / `formatSecondaryLine` mirror the
// ones in `thread-row.tsx`; both files are user-owned and a shared
// module is unnecessary for two short call sites.

import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { OtherParticipantSummary } from '@/lib/contracts/messages';

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

export type ConversationHeaderProps = {
  participant: OtherParticipantSummary;
};

export function ConversationHeader({ participant }: ConversationHeaderProps) {
  const name = participant.name.trim().length > 0 ? participant.name : '—';
  const secondary = formatSecondaryLine(participant);

  return (
    <div className="flex items-start gap-4">
      <Link
        href="/messages"
        aria-label="Back to conversations"
        className="flex shrink-0 items-center justify-center self-center rounded-md border border-border/70 bg-card px-3 py-2 text-caption text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
      >
        Back
      </Link>

      <Avatar className="size-12">
        {participant.avatarUrl ? (
          <AvatarImage src={participant.avatarUrl} alt={`${name}'s avatar`} />
        ) : null}
        <AvatarFallback className="text-caption font-medium text-muted-foreground">
          {pickInitial(participant)}
        </AvatarFallback>
      </Avatar>

      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="truncate text-body font-semibold text-foreground">{name}</p>
        {secondary !== null ? (
          <p className="truncate text-caption text-muted-foreground">{secondary}</p>
        ) : null}
      </div>
    </div>
  );
}
