// @polsia:user-owned

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function CTASection() {
  return (
    <section id="join" className="section-lg">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-8 py-16 text-center lg:px-16 lg:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                'radial-gradient(ellipse 70% 80% at 50% 0%, oklch(0.90 0.07 15 / 0.12) 0%, transparent 70%)',
            }}
          />

          <Badge
            variant="outline"
            className="mb-6 border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
          >
            Ready to begin?
          </Badge>

          <h2 className="font-display text-3xl font-bold tracking-tight text-card-foreground lg:text-4xl">
            Your meaningful connection is waiting
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-body-lg text-muted-foreground">
            Join Heart Lines today and discover a community of like-minded adults who are ready for
            the same thing you are — a genuine, lasting relationship.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg" className="gap-2 text-base">
              <a href="/signup">
                Create your account
                <svg
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </a>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-base">
              <a href="/login">I already have an account</a>
            </Button>
          </div>

          <p className="mt-6 text-small text-muted-foreground">
            Questions?{' '}
            <a
              href="mailto:heart-lines@polsia.app"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              heart-lines@polsia.app
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
