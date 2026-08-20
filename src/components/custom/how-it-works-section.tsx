// @polsia:user-owned

import { Badge } from '@/components/ui/badge';

const STEPS = [
  {
    number: '01',
    title: 'Create your profile',
    description:
      'Sign up and build a profile that reflects who you really are. Add photos, share your interests, and answer our compatibility questionnaire — designed to surface what truly matters in a relationship.',
  },
  {
    number: '02',
    title: 'Get matched thoughtfully',
    description:
      "Our matching algorithm considers your values, lifestyle, and relationship goals — not just your search radius. You'll receive curated match suggestions rather than an endless stream of profiles.",
  },
  {
    number: '03',
    title: 'Connect with confidence',
    description:
      'Start conversations with intention. Our guided prompts help you move beyond "hey, how are you?" to meaningful exchanges that reveal genuine compatibility.',
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="section-lg">
      <div className="container-page">
        {/* Section header */}
        <div className="mb-16 flex flex-col gap-4 text-center">
          <Badge
            variant="outline"
            className="mx-auto w-fit border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
          >
            Simple &amp; secure
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
            How Heart Lines works
          </h2>
          <p className="max-w-2xl mx-auto text-body-lg text-muted-foreground">
            No complicated algorithms or gamified swipes. Just a straightforward path to meeting
            someone special.
          </p>
        </div>

        {/* Steps — 3-column layout on desktop, stacked on mobile */}
        <div className="grid gap-8 lg:grid-cols-3 lg:gap-12">
          {STEPS.map((step) => (
            <div key={step.number} className="flex flex-col gap-4">
              <div className="flex flex-col gap-3">
                {/* Step number badge */}
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-display text-lg font-bold shadow-sm">
                    {step.number}
                  </div>
                  <div className="h-px flex-1 bg-border lg:hidden" />
                </div>
                <h3 className="font-display text-xl font-semibold text-foreground">{step.title}</h3>
                <p className="text-body text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
