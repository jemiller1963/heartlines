// @polsia:user-owned — polling client island for the `/payment/success`
// page. Reads `session_id` from the URL, polls
// `/api/stripe-billing/verify?session_id=...` every ~1.5s (up to 10
// attempts), and renders the matching state. We do NOT accept the payment as
// verified on a single round-trip; the brief requires "poll, not
// verify-once".

'use client';

import { CheckCircle2, Hourglass, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const POLL_INTERVAL_MS = 1500;
const POLL_MAX_ATTEMPTS = 10;

type State =
  | { kind: 'no-session' }
  | { kind: 'polling' }
  | { kind: 'verified' }
  | { kind: 'still-processing' }
  | { kind: 'failed'; message: string };

function readSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  return params.get('session_id') ?? params.get('checkout_session_id');
}

export function PaymentSuccessClient() {
  const [state, setState] = useState<State>(() => {
    const id = readSessionId();
    return id === null ? { kind: 'no-session' } : { kind: 'polling' };
  });

  // Refs sidestep the effect-restart-cancled-timer race — the loop owns
  // its own cancellation and schedule, completely inside the effect.
  const cancelledRef = useRef(false);

  useEffect(() => {
    const sessionId = readSessionId();
    if (sessionId === null) {
      setState({ kind: 'no-session' });
      return;
    }
    cancelledRef.current = false;

    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const runAttempt = async () => {
      if (cancelledRef.current) return;
      attempt += 1;
      try {
        const res = await fetch(
          `/api/stripe-billing/verify?session_id=${encodeURIComponent(sessionId)}`,
          { cache: 'no-store' },
        );
        const body = (await res.json().catch(() => ({}))) as {
          verified?: boolean;
          error?: string;
        };
        if (cancelledRef.current) return;
        if (res.ok && body.verified === true) {
          setState({ kind: 'verified' });
          return;
        }
        if (attempt >= POLL_MAX_ATTEMPTS) {
          setState({ kind: 'still-processing' });
          return;
        }
        timer = setTimeout(runAttempt, POLL_INTERVAL_MS);
      } catch {
        if (cancelledRef.current) return;
        if (attempt >= POLL_MAX_ATTEMPTS) {
          setState({ kind: 'still-processing' });
          return;
        }
        timer = setTimeout(runAttempt, POLL_INTERVAL_MS);
      }
    };

    void runAttempt();

    return () => {
      cancelledRef.current = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  if (state.kind === 'no-session') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card p-8 shadow-sm">
        <XCircle aria-hidden="true" className="size-10 text-destructive" />
        <h1 className="text-h3 font-semibold text-foreground">No session to verify</h1>
        <p className="text-body text-muted-foreground">
          We did not find a Stripe checkout session in that URL. If you just paid, please give us a
          moment and refresh the page from your email receipt.
        </p>
        <Button asChild variant="outline">
          <Link href="/pricing">Back to pricing</Link>
        </Button>
      </div>
    );
  }

  if (state.kind === 'verified') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-brand-500/50 bg-brand-50 p-8 shadow-sm">
        <CheckCircle2 aria-hidden="true" className="size-10 text-brand-600" />
        <h1 className="text-h3 font-semibold text-foreground">Welcome to Premium</h1>
        <p className="text-body text-muted-foreground">
          Your Heart Lines Premium subscription is active. We just unlocked unlimited messages and
          video dates — head back to your matches and say hello.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/messages">Open messages</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/video-sessions">Video dates</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === 'failed') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 shadow-sm">
        <XCircle aria-hidden="true" className="size-10 text-destructive" />
        <h1 className="text-h3 font-semibold text-foreground">We could not confirm your payment</h1>
        <p className="text-body text-muted-foreground">{state.message}</p>
        <Button asChild variant="outline">
          <Link href="/pricing">Back to pricing</Link>
        </Button>
      </div>
    );
  }

  if (state.kind === 'still-processing') {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card p-8 shadow-sm">
        <Hourglass aria-hidden="true" className="size-10 text-brand-500" />
        <h1 className="text-h3 font-semibold text-foreground">Still processing…</h1>
        <p className="text-body text-muted-foreground">
          Stripe usually confirms within a few seconds. If you do not see Premium unlocked in a
          minute, check your email for the Stripe receipt — your access will apply on the next page
          load regardless.
        </p>
        <Button asChild variant="outline">
          <Link href="/messages">Continue to messages</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card p-8 shadow-sm">
      <Hourglass aria-hidden="true" className="size-10 animate-pulse text-brand-500" />
      <h1 className="text-h3 font-semibold text-foreground">Confirming your payment…</h1>
      <p className="text-body text-muted-foreground">
        We are verifying your checkout with Stripe. This usually takes a few seconds.
      </p>
      <Skeleton className="h-2 w-40" />
    </div>
  );
}
