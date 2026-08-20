// @polsia:user-owned — single chat bubble for the in-app conversation
// page (`/messages/[threadId]`). Pure-function component, no
// `'use client'` directive of its own (it's already imported by a client
// island). Aligns based on `viewerId === item.senderId`:
//
//   - own message → right edge, brand-tinted card surface.
//   - peer message → left edge, muted card surface.
//
// Renders a relative timestamp below the bubble. When `isOptimistic`,
// the bubble shows a small "Sending…" caption so the user sees a hint
// that the row is in-flight (vs. an authoritative row from the
// server). The `formatRelativeTime` helper is file-local — mirrors
// the same convention in `thread-row.tsx`.

import type { MessageDetail } from '@/lib/contracts/messages';

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

export type MessageBubbleProps = {
  item: MessageDetail;
  viewerId: string | null;
  isOptimistic: boolean;
};

export function MessageBubble({ item, viewerId, isOptimistic }: MessageBubbleProps) {
  const isOwn = viewerId !== null && item.senderId === viewerId;
  const timestamp = formatRelativeTime(item.createdAt);

  return (
    <div
      className={`flex w-full flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}
      data-sender={isOwn ? 'viewer' : 'peer'}
      data-optimistic={isOptimistic ? 'true' : 'false'}
    >
      <div
        className={`max-w-[78%] whitespace-pre-line break-words rounded-2xl border px-4 py-2 text-body shadow-xs ${
          isOwn
            ? 'rounded-br-md border-brand-200/80 bg-brand-100 text-foreground'
            : 'rounded-bl-md border-border/70 bg-card text-foreground'
        } ${isOptimistic ? 'opacity-70' : ''}`}
      >
        {item.body}
      </div>

      <div
        className={`flex items-center gap-2 text-caption text-muted-foreground ${
          isOwn ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <span title={`Sent ${timestamp}`}>{timestamp}</span>
        {isOptimistic ? <span className="italic">Sending…</span> : null}
      </div>
    </div>
  );
}
