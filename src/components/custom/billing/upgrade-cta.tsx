// @polsia:user-owned — primary CTA that creates a hosted Stripe Checkout
// session via `POST /api/billing/checkout` and redirects the browser to the
// returned URL. Lives in the conversation composer (replaces a "send"),
// the video-sessions inbox (replaces "accept"), and as the pricing page's
// rationale. Typed errors render as a toast so the operator-facing
// onboarding message reaches the user ("finish Stripe onboarding…") without
// us swallowing it.

'use client';

import { CreditCard, Loader2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { Button, type ButtonProps } from '@/components/ui/button';
import { apiFetch } from '@/lib/api-client';
import { CheckoutResult as CheckoutResultSchema } from '@/lib/contracts/billing';
import { cn } from '@/lib/utils';

export interface UpgradeCtaProps extends Omit<ButtonProps, 'asChild' | 'children' | 'onClick'> {
  /** Visible label; defaults to "Upgrade to Premium". */
  label?: string;
  /** Conversation-page reason keeps the toast copy helpful when the upgrade
   *  was prompted from the composer (e.g. "to message"). */
  reason?: 'message' | 'video' | 'generic';
  /** Optional content rendered next to/inside the button. */
  children?: ReactNode;
  /** Override the default product id. Plumb when multiple tiers exist. */
  productId?: string;
}

const REASON_HINT: Record<NonNullable<UpgradeCtaProps['reason']>, string> = {
  message: 'to send messages to your matches',
  video: 'to join a video date',
  generic: 'to use this feature',
};

export function UpgradeCta({
  label = 'Upgrade to Premium',
  reason = 'generic',
  productId = 'premium-monthly',
  className,
  children,
  disabled,
  ...buttonProps
}: UpgradeCtaProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy || disabled) return;
    setBusy(true);
    try {
      const result = await apiFetch<{ url: string }>('/api/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({ productId }),
        schema: CheckoutResultSchema,
      });
      // Window.location rather than router push: Stripe redirects to a
      // third-party checkout domain; client-side router only intercepts
      // same-origin navigations.
      window.location.href = result.url;
    } catch (err) {
      const cause = (err as Error & { cause?: { errors?: Record<string, string> } }).cause;
      const billingMessage = cause?.errors?.billing ?? (err as Error).message;
      toast.error(
        billingMessage && billingMessage.length > 0
          ? billingMessage
          : 'Could not start checkout — try again in a moment.',
      );
      setBusy(false);
    }
  }

  return (
    <Button
      {...buttonProps}
      type="button"
      onClick={handleClick}
      disabled={busy || disabled}
      className={cn('gap-2', className)}
      title={REASON_HINT[reason]}
      aria-busy={busy}
    >
      {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
      <CreditCard aria-hidden="true" className="size-4" />
      {children ?? label}
    </Button>
  );
}
