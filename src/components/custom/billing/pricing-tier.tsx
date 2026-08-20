// @polsia:user-owned — one tier card for the landing-page pricing section.
// Mirrors the visual language of `pricing-card.tsx` (warm gradient strip,
// eyebrow/title/description, price/bullets/CTA) but parameterised so the Free
// tier and the Paid tier share one shell instead of duplicating markup.
//
// The Paid-tier CTA reuses `<UpgradeCta />` (`Stripe`-hosted checkout island;
// server-side-enforced amount via /api/billing/checkout). The Free-tier CTA
// is a static link to `/signup?plan=free` — no DB read, no apiFetch, so it
// stays a Server-Component-safe static anchor. This file is `'use client'`
// only so the Paid branch can render the existing client island side-by-side
// with the Free branch without a separate boundary per tier.

'use client';

import { Check, Heart, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { UpgradeCta } from '@/components/custom/billing/upgrade-cta';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

type CtaKind =
  | { readonly kind: 'free'; readonly href: string; readonly label: string }
  | { readonly kind: 'premium'; readonly label: string };

export interface PricingTierProps {
  /** Brand eyebrow line above the title (e.g. "Free tier" / "Premium tier"). */
  eyebrow: string;
  /** Tier headline. */
  title: string;
  /** One-line description shown under the title. */
  description: string;
  /** Big price (e.g. "$0" or "$25"). */
  price: string;
  /** Period label next to the price (e.g. "per month"). */
  interval: string;
  /** Bulleted benefits rendered as a checkmark list. */
  bullets: readonly string[];
  /** CTA: Free tier -> static link; Premium -> server-enforced Stripe checkout. */
  cta: CtaKind;
  /** Sub-line under the CTA button (trust / reassurance line). */
  microcopy?: string;
  /** Optional `className` appended to the outer `Card`. */
  className?: string;
  /** Optional trailing slot for a sub-CTA link (e.g. "See the full comparison"). */
  footerChildren?: ReactNode;
}

export function PricingTier({
  eyebrow,
  title,
  description,
  price,
  interval,
  bullets,
  cta,
  microcopy,
  className,
  footerChildren,
}: PricingTierProps) {
  const isPremium = cta.kind === 'premium';
  return (
    <Card
      className={cn(
        'relative flex h-full max-w-md flex-col overflow-hidden border-brand-500/40 shadow-md',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-300 via-brand-500 to-brand-700',
          isPremium ? 'opacity-100' : 'opacity-70',
        )}
      />
      <CardHeader className="gap-2">
        <p className="flex items-center gap-2 text-eyebrow text-brand-600">
          {isPremium ? (
            <Sparkles aria-hidden="true" className="size-3.5" />
          ) : (
            <Heart aria-hidden="true" className="size-3.5" />
          )}
          {eyebrow}
        </p>
        <CardTitle className="text-h2 text-foreground">{title}</CardTitle>
        <CardDescription className="text-body text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5">
        <div className="flex items-baseline gap-2">
          <span className="text-display font-semibold tracking-tight text-foreground">{price}</span>
          <span className="text-body text-muted-foreground">{interval}</span>
        </div>
        <Separator />
        <ul className="flex flex-col gap-2.5 text-body">
          {bullets.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-foreground">
              <Check aria-hidden="true" className="mt-0.5 size-4 text-brand-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        {cta.kind === 'premium' ? (
          <UpgradeCta className="w-full" label={cta.label} />
        ) : (
          <Button asChild variant="outline" className="w-full">
            <a href={cta.href}>{cta.label}</a>
          </Button>
        )}
        {microcopy ? (
          <p className="flex items-center justify-center gap-1.5 text-caption text-muted-foreground">
            <Heart aria-hidden="true" className="size-3 text-brand-500" />
            {microcopy}
          </p>
        ) : null}
        {footerChildren}
      </CardFooter>
    </Card>
  );
}
