// @polsia:user-owned

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const FEATURES = [
  {
    title: 'Deep Compatibility Assessment',
    description:
      'Our structured questionnaire goes beyond surface-level preferences to reveal your values, lifestyle priorities, and relationship goals — so we can match you with people who truly complement you.',
    icon: (
      <svg
        aria-hidden="true"
        className="size-6 shrink-0 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904 9 9.75 9.813 3.5l4.374 0L15.5 9.75l-0.813 6.154A4.494 4.494 0 0 0 15.5 21H8.5a4.494 4.494 0 0 0-6.687-5.096Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m12 12 3 3" />
      </svg>
    ),
  },
  {
    title: 'Curated, Authentic Profiles',
    description:
      'Every profile is manually reviewed to ensure quality and authenticity. No catfishing, no fake photos — just real people ready for real connection.',
    icon: (
      <svg
        aria-hidden="true"
        className="size-6 shrink-0 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.147-1.141-3.093m0 0A9.338 9.338 0 0 0 15 6.872V6.87M12 6.872a4.125 4.125 0 1 0 0 8.25m0 0c-1.102-.839-2.276-1.475-3.439-1.847M18.42 15a1.707 1.707 0 0 0 .493-1.609l-2.4-2.4a1.707 1.707 0 0 0-1.609-.493 1.686 1.686 0 0 0-1.182 0 1.707 1.707 0 0 0-1.609.493l-2.4 2.4a1.707 1.707 0 0 0-.493 1.609m13.12 0-2.4-2.4M4.58 15a1.707 1.707 0 0 0 .493 1.609l2.4 2.4a1.707 1.707 0 0 0 1.609.493 1.686 1.686 0 0 0 1.182 0 1.707 1.707 0 0 0 1.609-.493l2.4-2.4a1.707 1.707 0 0 0 .493-1.609m-13.12 0-2.4 2.4"
        />
      </svg>
    ),
  },
  {
    title: 'Advanced Privacy Controls',
    description:
      'You decide who sees your profile, who can message you, and what details are visible. Our privacy-first design gives you complete control over your dating experience.',
    icon: (
      <svg
        aria-hidden="true"
        className="size-6 shrink-0 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
        />
      </svg>
    ),
  },
  {
    title: 'Thoughtful Conversation Starters',
    description:
      'Matched on shared values, not just shared hobbies. Our conversation prompts help you move beyond small talk and discover genuine compatibility.',
    icon: (
      <svg
        aria-hidden="true"
        className="size-6 shrink-0 text-brand-600"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 1 0-1.063m13.5-3.5c-.055-.406-.16-.8-.31-1.171A5.979 5.979 0 0 0 21 12c0-4.556-4.03-8.25-9-8.25a9.764 9.764 0 0 0-2.555.337A5.972 5.972 0 0 1 5.41 6.03a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 1 0-1.063m13.5 3.5c.055-.406.16-.8.31-1.171A5.979 5.979 0 0 0 21 12"
        />
      </svg>
    ),
  },
];

export function FeaturesSection() {
  return (
    <section id="features" className="section bg-muted/30">
      <div className="container-page">
        {/* Section header */}
        <div className="mb-12 flex flex-col gap-4 text-center">
          <Badge
            variant="outline"
            className="mx-auto w-fit border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
          >
            Built differently
          </Badge>
          <h2 className="font-display text-3xl font-bold tracking-tight text-foreground lg:text-4xl">
            A platform designed for lasting connection
          </h2>
          <p className="max-w-2xl mx-auto text-body-lg text-muted-foreground">
            Heart Lines was created because mainstream dating apps aren&apos;t built for people over
            50 seeking something real. We built it differently — with intention, privacy, and
            respect.
          </p>
        </div>

        {/* Feature cards — 2-column grid on desktop, 1-column on mobile */}
        <div className="grid gap-6 lg:grid-cols-2">
          {FEATURES.map((feature) => (
            <Card
              key={feature.title}
              className="group border-border bg-card transition-shadow duration-200 hover:shadow-lg"
            >
              <CardHeader className="flex-row items-start gap-4 pb-2">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-200 dark:bg-brand-900/30 dark:text-brand-400 dark:ring-brand-800">
                  {feature.icon}
                </div>
                <CardTitle className="font-display text-xl font-semibold tracking-tight text-card-foreground">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-body text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
