// @polsia:user-owned — public-facing pricing section for `/`. Server Component
// (no DB read, no `await fetch`) that composes two `<PricingTier />` client
// islands: Free ($0) and Premium ($25/month). The Free CTA is a static link to
// `/signup?plan=free`; the Premium CTA reuses the existing `<UpgradeCta />`
// island which posts to `/api/billing/checkout` (server-side-enforced amount).
//
// Markup follows the other landing sections: an `id="pricing"` so the
// `/#pricing` anchor scrolls here, the `section`/`container-page` rhythm, and
// the brand eyebrow + h2 established by the hero and features sections.

import { PricingTier } from '@/components/custom/billing/pricing-tier';
import { Badge } from '@/components/ui/badge';

const FREE_BULLETS = [
  'Build and share your profile',
  'Browse and swipe the discover stack',
  'Read messages a match sends first',
];

const PAID_BULLETS = [
  'Everything in Free',
  'Send unlimited messages to your matches',
  'Accept and join video dates',
  'Same warm, human experience — no ads',
];

export function PricingSection() {
  return (
    <section id="pricing" className="section bg-muted/30">
      <div className="container-page">
        {/* Section header */}
        <div className="mb-12 flex flex-col gap-4 text-center">
          <Badge
            variant="outline"
            className="mx-auto w-fit border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
          >
            Pricing
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
            Browse the stack free. Subscribe when you&rsquo;re ready to connect.
          </h2>
          <p className="mx-auto max-w-2xl text-body-lg text-muted-foreground">
            Heart Lines keeps the browsing free. The $25 monthly Premium tier unlocks the
            conversations and video dates — pay only when you&rsquo;re ready to message.
          </p>
        </div>

        {/* Two-tier grid — Free + Premium, equal h-full so the cards align */}
        <div className="grid gap-6 md:grid-cols-2 md:items-stretch md:justify-center">
          <PricingTier
            eyebrow="Free tier"
            title="Browse &amp; match"
            description="Build your profile, explore the discover stack, and read every message a match sends first — all free, no credit card."
            price="$0"
            interval="always"
            bullets={FREE_BULLETS}
            cta={{ kind: 'free', href: '/signup?plan=free', label: 'Create a free account' }}
            microcopy="No card, no expiration — Heart Lines Free is yours for as long as you keep browsing."
          />
          <PricingTier
            eyebrow="Premium tier"
            title="Heart Lines Premium"
            description="The single tier that unlocks every conversation, every video date, and the full warmth of the platform."
            price="$25"
            interval="per month"
            bullets={PAID_BULLETS}
            cta={{ kind: 'premium', label: 'Subscribe — $25 / month' }}
            microcopy="Secure checkout by Stripe · cancel anytime in Heart Lines"
          />
        </div>

        <p className="mt-8 text-center text-caption text-muted-foreground">
          Want the full feature breakdown?{' '}
          <a
            href="/pricing"
            className="font-semibold text-brand-700 underline underline-offset-2 transition-colors hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
          >
            See the comparison
          </a>{' '}
          on the pricing page.
        </p>
      </div>
    </section>
  );
}
