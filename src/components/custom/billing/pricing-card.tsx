// @polsia:user-owned — single Heart Lines Premium tier card. Composes
// `UpgradeCta` so the price is server-side and the upgrade promise is
// consistent with the gating copy elsewhere on the site.

'use client';

import { Check, Heart, Sparkles } from 'lucide-react';
import { UpgradeCta } from '@/components/custom/billing/upgrade-cta';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export interface PricingCardProps {
  /** Headline tier label. Defaults to the brand tier. */
  title?: string;
  /** Sub-line under the title. Defaults to the value-prop. */
  description?: string;
  /** Price per period — server-side; never read from the browser. */
  price?: string;
  /** Uppercase period label (e.g. "MONTHLY"). */
  interval?: string;
  /** Per-tier benefits; renders as a checkmark list. */
  features?: readonly string[];
  /** CTA label override. */
  ctaLabel?: string;
}

const DEFAULT_FEATURES = [
  'Send unlimited messages to your matches',
  'Accept and join video dates',
  'Same warm, human experience — no ads, no upsells',
];

export function PricingCard({
  title = 'Heart Lines Premium',
  description = 'A single tier that unlocks every conversation and video date.',
  price = '$25',
  interval = 'per month',
  features,
  ctaLabel,
}: PricingCardProps) {
  const list = features ?? DEFAULT_FEATURES;
  return (
    <Card className="relative flex h-full max-w-md flex-col overflow-hidden border-brand-500/40 shadow-md">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-300 via-brand-500 to-brand-700"
      />
      <CardHeader className="gap-2">
        <p className="flex items-center gap-2 text-eyebrow text-brand-600">
          <Sparkles aria-hidden="true" className="size-3.5" />
          Premium tier
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
          {list.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-foreground">
              <Check aria-hidden="true" className="mt-0.5 size-4 text-brand-500" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
      <CardFooter className="flex flex-col gap-3">
        <UpgradeCta className="w-full" label={ctaLabel ?? 'Subscribe — $25 / month'} />
        <p className="flex items-center justify-center gap-1.5 text-caption text-muted-foreground">
          <Heart aria-hidden="true" className="size-3 text-brand-500" />
          Secure checkout by Stripe · cancel anytime in Heart Lines
        </p>
      </CardFooter>
    </Card>
  );
}
