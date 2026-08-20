// @polsia:user-owned — landing page served at /.

import type { Metadata } from 'next';
import { PricingSection } from '@/components/custom/billing/pricing-section';
import { CTASection } from '@/components/custom/cta-section';
import { FeaturesSection } from '@/components/custom/features-section';
import { HeroSection } from '@/components/custom/hero-section';
import { HowItWorksSection } from '@/components/custom/how-it-works-section';
import { StatsSection } from '@/components/custom/stats-section';
import { WaitlistSignupForm } from '@/components/custom/waitlist-signup-form';
import { siteDescription, siteName } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: siteName },
  description: siteDescription,
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return (
    <main>
      <HeroSection />
      <StatsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <section id="waitlist" className="section">
        <div className="container-page text-center">
          <h2 className="font-display text-h2 font-bold tracking-tight text-foreground">
            Be the first to hear when we open
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-body-lg text-muted-foreground">
            Join the Heart Lines waitlist and we'll let you know as soon as sign-ups open in your
            area.
          </p>
          <div className="mt-8">
            <WaitlistSignupForm />
          </div>
        </div>
      </section>
      <CTASection />
    </main>
  );
}
