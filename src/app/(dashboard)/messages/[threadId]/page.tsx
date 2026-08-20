// @polsia:user-owned — `/messages/[threadId]` conversation page (client
// island). Single-thread surface — header with the other participant's
// avatar/name/age/city, a scrollable history of bubbles aligned by
// author, and a bottom-pinned composer that POSTs new messages
// optimistically. Matches the LoadState + apiFetch + zod contract
// pattern used by the `/messages` inbox and `/feed`.
//
// Data plane:
//   - History bubbles — `GET /api/messages/[threadId]/messages`
//     (cursor pagination, newest-first DESC). The list is rendered
//     oldest-first at the top → newest at the bottom (reversed in
//     component state).
//   - Thread header (other participant) — fetched once via
//     `GET /api/messages/threads` so no new IDOR surface is opened and
//     the row matching `threadId` is reused. A non-participant gets
//     404 from that endpoint and we render a "Conversation not
//     available" tile.
//   - Send — `POST /api/messages/[threadId]` (MessageSend → Message)
//     with optimistic append on submit.
//
// The (dashboard) layout's DashboardShell owns the unauthenticated
// redirect; we swallow 401 quietly here so the redirect can do its job
// without us toasting noise.
//
// This page intentionally does NOT import any server-only module
// (`@/lib/db`, `@prisma/client`, `server-only`, `next/headers`). The
// biome lint rule `noRestrictedImports` enforces this; the run fails
// on a violation, so the only correct path is data-via-`apiFetch`.

'use client';

import { ArrowLeft, ArrowUpRight, Mail, MessageSquare, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { UpgradeCta } from '@/components/custom/billing/upgrade-cta';
import { ConversationHeader } from '@/components/custom/messages/conversation-header';
import { MessageBubble } from '@/components/custom/messages/message-bubble';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import {
  type MessageDetail,
  type MessageHistoryPage,
  MessageHistoryPage as MessageHistoryPageSchema,
  type MessageResult,
  MessageResult as MessageResultSchema,
  type MessageSend,
  MessageSend as MessageSendSchema,
  type MessageThreadSummary,
  MessageThreadsList as MessageThreadsListSchema,
  type OtherParticipantSummary,
} from '@/lib/contracts/messages';
import {
  SubscriptionStatus as SubscriptionStatusSchema,
  type SubscriptionStatus as SubscriptionStatusT,
} from '@/lib/contracts/subscription';
import { useMountedSession } from '@/lib/use-auth-session';

// Discriminated union for the page's view state. Mirrors the
// `LoadState` shape on the existing `/messages` and `/feed` islands.
type LoadState =
  | { kind: 'loading' }
  | { kind: 'not-found' } // thread id miss OR non-participant
  | { kind: 'empty'; otherParticipant: OtherParticipantSummary }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      // oldest-first ascending (reversed from API). New messages are
      // appended to the tail; "load older" prepends to the head.
      messages: MessageDetail[];
      otherParticipant: OtherParticipantSummary;
      hasMore: boolean;
    };

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export default function ConversationPage() {
  const params = useParams<{ threadId: string }>();
  const threadId = typeof params?.threadId === 'string' ? params.threadId : '';

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [subscription, setSubscription] = useState<SubscriptionStatusT | null>(null);
  const [input, setInput] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);

  const optimisticCounter = useRef(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const previousScrollHeightRef = useRef<number | null>(null);

  const { data: session } = useMountedSession();
  const viewerId = session?.user?.id ?? null;
  const viewerName = session?.user?.name ?? '';

  // Validate the composer payload on every keystroke so the Send
  // button reflects the most-recent safeParse result without a
  // re-render storm beyond the natural input update. `MessageSend`
  // trims before its min/max check, so whitespace-only input fails
  // the schema and the Send button stays disabled.
  const inputParse = useMemo(() => MessageSendSchema.safeParse(input), [input]);
  const hasValidInput = inputParse.success;
  const isComposerBusy = sending;

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  // --- initial load: thread header + first page of bubbles + subscription --
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;

    async function loadInitial() {
      try {
        const [threadsRes, historyRes, subscriptionRes] = await Promise.all([
          apiFetch<{ items: MessageThreadSummary[] }>('/api/messages/threads', {
            method: 'GET',
            schema: MessageThreadsListSchema,
          }),
          apiFetch<MessageHistoryPage>(`/api/messages/${encodeURIComponent(threadId)}/messages`, {
            method: 'GET',
            schema: MessageHistoryPageSchema,
          }),
          // Subscription status is best-effort: a fetch error below leaves
          // `subscription === null` (treated as not-subscribed) so the
          // composer gets safely disabled rather than enabled by guessing.
          apiFetch<SubscriptionStatusT>('/api/subscription', {
            method: 'GET',
            schema: SubscriptionStatusSchema,
          }),
        ]);

        if (cancelled) return;
        setSubscription(subscriptionRes);

        const header = threadsRes.items.find((t) => t.id === threadId);
        if (!header) {
          // Non-participant / unknown thread — `/api/messages/threads`
          // already scopes by `userAId/userBId == session.id`, so a
          // missing row here is the canonical "not available" UX.
          setState({ kind: 'not-found' });
          return;
        }

        // History comes back newest-first; reverse to oldest-first so
        // the visible list reads top→bottom = oldest→newest and
        // append-on-send lands on the tail (newest).
        const oldestFirst = [...historyRes.items].reverse();
        if (oldestFirst.length === 0) {
          setState({
            kind: 'empty',
            otherParticipant: header.otherParticipant,
          });
          return;
        }

        setState({
          kind: 'ready',
          messages: oldestFirst,
          otherParticipant: header.otherParticipant,
          hasMore: historyRes.nextCursor !== null,
        });
      } catch (err) {
        if (cancelled) return;
        const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
        if (status === '401') {
          // DashboardShell owns the auth-redirect seam — hold loading.
          return;
        }
        if (status === '404' || status === '403') {
          setState({ kind: 'not-found' });
          return;
        }
        const message = extractErrorMessage(err, 'We could not load this conversation.');
        toast.error(message);
        setState({ kind: 'error', message });
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // --- auto-scroll on first paint / window resize ---------------------
  useEffect(() => {
    if (state.kind !== 'ready' && state.kind !== 'empty') return;
    // Defer one frame so the rendered bubble list / empty tile has
    // measured its height before we scroll.
    const raf = requestAnimationFrame(() => scrollToBottom());
    return () => cancelAnimationFrame(raf);
  }, [state.kind, scrollToBottom]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      scrollToBottom();
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [scrollToBottom]);

  // --- "load older" pagination --------------------------------------
  const handleLoadOlder = useCallback(async () => {
    if (state.kind !== 'ready' || !state.hasMore || loadingOlder) return;
    const cursor = state.messages[0]?.id ?? null;
    if (!cursor) return;

    setLoadingOlder(true);
    // Preserve viewport: snapshot the scroll height BEFORE the
    // prepend, then restore by the delta AFTER the prepend.
    const container = scrollRef.current;
    previousScrollHeightRef.current = container?.scrollHeight ?? null;

    try {
      const res = await apiFetch<MessageHistoryPage>(
        `/api/messages/${encodeURIComponent(threadId)}/messages?cursor=${encodeURIComponent(cursor)}`,
        { method: 'GET', schema: MessageHistoryPageSchema },
      );
      const olderNewestFirst = res.items;
      // The API returns the older page in `createdAt: desc`; we want
      // to PREPEND them above the current oldest row. Newest of the
      // older batch is the LAST in API order → our prepended HEAD.
      const olderOldestFirst = [...olderNewestFirst].reverse();

      setState((current) => {
        if (current.kind !== 'ready') return current;
        return {
          ...current,
          messages: [...olderOldestFirst, ...current.messages],
          hasMore: res.nextCursor !== null,
        };
      });

      // Restore the viewport: total scroll height has grown by
      // (newHeight - previousHeight); shift scrollTop by that delta
      // so the previously-visible row stays put.
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        const prev = previousScrollHeightRef.current;
        if (!el || prev === null) return;
        const delta = el.scrollHeight - prev;
        el.scrollTop = delta;
        previousScrollHeightRef.current = null;
      });
    } catch (err) {
      const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
      if (status !== '401') {
        toast.error('Could not load older messages.');
      }
      previousScrollHeightRef.current = null;
    } finally {
      setLoadingOlder(false);
    }
  }, [state, loadingOlder, threadId]);

  // --- send flow ----------------------------------------------------
  const handleSend = useCallback(async () => {
    if (!hasValidInput || isComposerBusy) return;
    if (!viewerId) {
      toast.error('You need to be signed in to send.');
      return;
    }
    // Subscription gate: composer is disabled when !active, but a stale
    // local state (rare) could still slip through — we re-check so the
    // click flips into the 402 toast path immediately rather than
    // silently dropping the send.
    if (subscription !== null && !subscription.active) {
      toast.error(
        'Upgrade to Premium to send messages to your matches — subscribe from the composer.',
      );
      return;
    }
    if (state.kind !== 'ready' && state.kind !== 'empty') return;

    const body = inputParse.success ? inputParse.data.body : '';
    if (body.length === 0) return;

    // Mint a unique stub id so the optimistic bubble can be replaced
    // after the canonical MessageResult returns.
    optimisticCounter.current += 1;
    const stubId = `optimistic-${optimisticCounter.current}`;
    const stubCreatedAt = new Date().toISOString();

    setInput('');
    setSending(true);

    setState((current) => {
      const stub: MessageDetail = {
        id: stubId,
        threadId,
        senderId: viewerId,
        senderName: viewerName,
        body,
        createdAt: stubCreatedAt,
      };
      if (current.kind === 'ready') {
        return { ...current, messages: [...current.messages, stub] };
      }
      if (current.kind === 'empty') {
        return {
          kind: 'ready',
          messages: [stub],
          otherParticipant: current.otherParticipant,
          hasMore: false,
        };
      }
      // Defensive: a send fired before initial load resolved → keep
      // the loading state; the optimistic append is dropped on
      // resolve since we'd otherwise mix it into the wrong base.
      return current;
    });

    // Scroll into view after the optimistic row is on screen.
    requestAnimationFrame(() => scrollToBottom());

    try {
      const payload: MessageSend = { body };
      const result = await apiFetch<MessageResult>(
        `/api/messages/${encodeURIComponent(threadId)}`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
          schema: MessageResultSchema,
        },
      );

      // The POST result lacks `senderName`; fill it from the session
      // so the canonical bubble keeps the rendered name.
      const canonical: MessageDetail = {
        id: result.id,
        threadId: result.threadId,
        senderId: result.senderId,
        senderName: viewerName,
        body: result.body,
        createdAt: result.createdAt,
      };

      setState((current) => {
        if (current.kind !== 'ready') {
          // Race: page moved away from `ready` (e.g. error reload).
          // Re-establish as `ready` so the persisted row is visible.
          const participant = current.kind === 'empty' ? current.otherParticipant : undefined;
          if (!participant) return current;
          return {
            kind: 'ready',
            messages: [canonical],
            otherParticipant: participant,
            hasMore: false,
          };
        }
        return {
          ...current,
          messages: current.messages.map((m) => (m.id === stubId ? canonical : m)),
        };
      });

      requestAnimationFrame(() => scrollToBottom());
    } catch (err) {
      const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
      if (status === '401') {
        // DashboardShell owns the redirect; drop the stub silently so
        // we don't leave a phantom sending-state row on redirect.
        setState((current) => {
          if (current.kind !== 'ready') return current;
          return {
            ...current,
            messages: current.messages.filter((m) => m.id !== stubId),
          };
        });
        return;
      }

      // 402 from the messages paywall — drop the stub (same contract as
      // 401), toast the server-supplied message, and flip into the
      // "needs upgrade" paint (the banner is reading subscription state,
      // so we also clear the local cache so it re-fetches).
      if (status === '402') {
        setState((current) => {
          if (current.kind !== 'ready') return current;
          return {
            ...current,
            messages: current.messages.filter((m) => m.id !== stubId),
          };
        });
        setInput(body);
        const cause = (err as Error & { cause?: { message?: string; error?: string } }).cause;
        toast.error(cause?.message ?? 'Upgrade to Premium to send messages to your matches.');
        setSubscription({ active: false, currentPeriodEnd: null, plan: null });
        return;
      }

      // Drop the stub on failure (per the plan). Toast the message and
      // restore the typed body so the user doesn't have to retype.
      setState((current) => {
        if (current.kind !== 'ready') return current;
        return {
          ...current,
          messages: current.messages.filter((m) => m.id !== stubId),
        };
      });

      // Restore content into the textarea; user can edit and retry.
      setInput(body);

      const message =
        status === '400'
          ? 'Message could not be sent — check the length and try again.'
          : extractErrorMessage(err, 'Could not send your message.');
      toast.error(message);
    } finally {
      setSending(false);
    }
  }, [
    hasValidInput,
    isComposerBusy,
    subscription,
    viewerId,
    viewerName,
    state,
    inputParse,
    threadId,
    scrollToBottom,
  ]);

  // --- composer key handlers ----------------------------------------
  const handleComposerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter') return;
      // Shift+Enter inserts a newline (default behavior) — only
      // bare Enter submits.
      if (event.shiftKey) return;
      event.preventDefault();
      void handleSend();
    },
    [handleSend],
  );

  // --- derive participant for header / 404 UX -----------------------
  const headerParticipant: OtherParticipantSummary | null =
    state.kind === 'ready' || state.kind === 'empty' ? state.otherParticipant : null;

  return (
    <div className="flex h-[calc(100dvh-7rem)] flex-col gap-4">
      {/* Top bar: back link + participant header. The header is
          present from the moment we have a participant; until then
          (loading / not-found) we render a stable skeleton so layout
          doesn't jump. */}
      <header className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xs">
        {headerParticipant !== null ? (
          <ConversationHeader participant={headerParticipant} />
        ) : (
          <div className="flex items-start gap-4">
            <div className="h-9 w-16 shrink-0 animate-pulse rounded-md bg-secondary/60" />
            <Skeleton className="size-12 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        )}
      </header>

      {/* Scrollable bubble region. Lives ABOVE the composer and
          grows to fill remaining vertical space; the composer is
          pinned at the bottom of the column. */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-2xl border border-border/70 bg-card/60 px-4 py-4 shadow-xs"
        aria-live="polite"
      >
        {state.kind === 'loading' ? (
          <div className="flex flex-col gap-3">
            {(['a', 'b', 'c', 'd', 'e'] as const).map((slot, idx) => (
              <div key={slot} className={`flex ${idx % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <Skeleton className={`h-10 ${idx % 3 === 0 ? 'w-3/5' : 'w-2/5'} rounded-2xl`} />
              </div>
            ))}
          </div>
        ) : null}

        {state.kind === 'not-found' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <MessageSquare aria-hidden="true" className="size-8 text-brand-500" />
            <h2 className="text-h3 font-semibold text-foreground">Conversation not available</h2>
            <p className="max-w-md text-body text-muted-foreground">
              We couldn&apos;t open this conversation. It may have been deleted or you may not have
              access.
            </p>
            <Button asChild variant="outline">
              <Link href="/messages" aria-label="Back to all conversations">
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to conversations
              </Link>
            </Button>
          </div>
        ) : null}

        {state.kind === 'error' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Mail aria-hidden="true" className="size-8 text-destructive" />
            <h2 className="text-h3 font-semibold text-foreground">{state.message}</h2>
            <Button
              variant="outline"
              onClick={() => {
                // Re-run the initial load by remount-keying via
                // threadId — simplest way to retry from an error
                // state without adding a retry state slot.
                setState({ kind: 'loading' });
              }}
            >
              Retry
            </Button>
          </div>
        ) : null}

        {state.kind === 'empty' ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <MessageSquare aria-hidden="true" className="size-8 text-brand-500" />
            <h2 className="text-h3 font-semibold text-foreground">No messages yet</h2>
            <p className="max-w-md text-body text-muted-foreground">
              Be the first to say hello — your match is waiting on the other side.
            </p>
          </div>
        ) : null}

        {state.kind === 'ready' ? (
          <div className="flex flex-col gap-3">
            {state.hasMore ? (
              <div className="flex justify-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleLoadOlder();
                  }}
                  disabled={loadingOlder}
                  aria-label="Load older messages"
                >
                  {loadingOlder ? 'Loading…' : 'Load older messages'}
                </Button>
              </div>
            ) : null}

            {state.messages.map((m) => (
              <MessageBubble
                key={m.id}
                item={m}
                viewerId={viewerId}
                isOptimistic={m.id.startsWith('optimistic-')}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Subscription gate banner — shown above the composer when the
          viewer is on a free plan and a thread is loaded, so the
          transition from "Loading…" to "Premium required" is intentional
          rather than the input just silently going inert. */}
      {subscription !== null &&
      !subscription.active &&
      (state.kind === 'ready' || state.kind === 'empty') ? (
        <output
          aria-live="polite"
          className="flex flex-col gap-2 rounded-2xl border border-brand-500/40 bg-brand-50 px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex min-w-0 items-start gap-3">
            <Sparkles aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-600" />
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="truncate text-body font-medium text-foreground">
                Premium unlocks messaging
              </p>
              <p className="text-caption text-muted-foreground">
                You can still read what your match sends. Sending and starting a video date require
                Heart Lines Premium.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild variant="link" size="sm">
              <Link href="/pricing" aria-label="See pricing details">
                See pricing
                <ArrowUpRight aria-hidden="true" className="size-3.5" />
              </Link>
            </Button>
            <UpgradeCta size="sm" reason="message" label="Upgrade — $25 / month" />
          </div>
        </output>
      ) : null}

      {/* Bottom-pinned composer. Disabled while loading / not-found;
          shown across all states so visually the page feels stable. */}
      <form
        className="flex shrink-0 items-end gap-2 rounded-2xl border border-border/70 bg-card px-3 py-3 shadow-xs"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSend();
        }}
      >
        <Textarea
          aria-label="Write a message"
          placeholder={
            state.kind === 'ready' || state.kind === 'empty'
              ? subscription?.active === false
                ? 'Upgrade to Premium to send messages…'
                : 'Write a message…'
              : 'Loading conversation…'
          }
          value={input}
          rows={2}
          maxLength={2100}
          disabled={
            state.kind === 'not-found' ||
            state.kind === 'loading' ||
            state.kind === 'error' ||
            (subscription !== null && !subscription.active)
          }
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          className="resize-none"
        />
        <Button
          type="submit"
          size="icon"
          disabled={
            !hasValidInput ||
            isComposerBusy ||
            state.kind === 'not-found' ||
            state.kind === 'loading' ||
            state.kind === 'error' ||
            (subscription !== null && !subscription.active)
          }
          aria-label="Send message"
        >
          <Send aria-hidden="true" className="size-4" />
        </Button>
      </form>

      {input.length > 2000 ? (
        <p className="text-caption text-destructive">Message is too long.</p>
      ) : null}
    </div>
  );
}
