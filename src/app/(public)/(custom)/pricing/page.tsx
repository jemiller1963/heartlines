// @polsia:user-owned — /pricing tier landing page.

import { Heart, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import { PricingCard } from '@/components/custom/billing/pricing-card';
import { siteName } from '@/lib/brand';

export const metadata: Metadata = {
  title: 'Pricing — Heart Lines Premium',
  description:
    'Heart Lines Premium is $25 per month — unlimited messages with your matches and full access to video dates. Browse and match for free; subscribe when you are ready to connect.',
  openGraph: {
    title: 'Pricing — Heart Lines Premium',
    description: 'Browse and match for free. $25 per month unlocks messages and video dates.',
  },
};

export default function PricingPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="section">
        <div className="container-page mx-auto flex flex-col items-center gap-6 text-center">
          <p className="flex items-center gap-2 text-eyebrow text-brand-600">
            <Heart aria-hidden="true" className="size-3.5" />
            One tier, no surprises
          </p>
          <h1 className="max-w-2xl text-h1 font-bold text-foreground">
            Pay for the conversations, not the browsing.
          </h1>
          <p className="max-w-xl text-body-lg text-muted-foreground">
            Browse {siteName} and match for free. When you are ready to send the first message or
            join a video date, Heart Lines Premium is the one tier that unlocks both.
          </p>
        </div>
      </section>

      <section className="pb-section">
        <div className="container-page mx-auto flex flex-col items-stretch gap-6 md:flex-row md:items-center md:justify-center">
          <PricingCard />
          <aside className="flex max-w-sm flex-col gap-3 rounded-2xl border border-border/70 bg-card p-6 text-body text-muted-foreground shadow-sm">
            <p className="flex items-center gap-2 text-eyebrow text-foreground">
              <ShieldCheck aria-hidden="true" className="size-4 text-brand-500" />
              What stays free
            </p>
            <ul className="flex flex-col gap-2">
              <li>Building and editing your profile</li>
              <li>Browsing the discover stack and swiping</li>
              <li>Reading messages your matches send first</li>
            </ul>
            <p className="pt-2 text-caption text-muted-foreground">
              Cancel any time from your Heart Lines account — Stripe keeps the billing safe and
              PCI-compliant on our side.
            </p>
          </aside>
        </div>
      </section>
    </main>
  );
}
