// @polsia:user-owned — signup page.

import type { Metadata } from 'next';
import Link from 'next/link';
import { SignUpForm } from '@/components/custom/sign-up-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Create your account — Heart Lines',
  description:
    'Join Heart Lines, a thoughtful dating community exclusively for adults age 50 and older.',
  robots: { index: false },
};

export default function SignupPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-background px-gutter py-14 sm:py-20">
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 top-16 h-80 w-80 rounded-full bg-brand-100/60 blur-3xl" />
        <div className="absolute -right-28 bottom-0 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
      </div>
      <div className="container-page relative z-10 grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(420px,1fr)] lg:items-start lg:gap-20">
        <section className="max-w-xl pt-4 lg:pt-12">
          <p className="text-eyebrow text-brand-700">A thoughtful place to begin</p>
          <h1 className="mt-4 max-w-lg font-display text-display text-foreground">
            A new chapter can start here.
          </h1>
          <p className="mt-6 max-w-lg text-body-lg text-muted-foreground">
            Heart Lines is exclusively for adults age 50 and older who are open to meaningful
            connections. Start with the essentials; your profile comes next.
          </p>
          <ol className="mt-10 flex max-w-md flex-col gap-6 border-l border-brand-300 pl-6">
            <li>
              <p className="text-small font-semibold uppercase tracking-[0.14em] text-brand-700">
                First
              </p>
              <p className="mt-1 text-body text-foreground">Create your account.</p>
            </li>
            <li>
              <p className="text-small font-semibold uppercase tracking-[0.14em] text-brand-700">
                Then
              </p>
              <p className="mt-1 text-body text-foreground">Create your member profile.</p>
            </li>
            <li>
              <p className="text-small font-semibold uppercase tracking-[0.14em] text-brand-700">
                After that
              </p>
              <p className="mt-1 text-body text-foreground">
                Your profile enters the existing review process. Only approved, otherwise eligible,
                visible profiles can appear in Matches.
              </p>
            </li>
          </ol>
        </section>

        <Card className="w-full border-border/70 bg-card/95 shadow-brand backdrop-blur-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-h3">Create your account</CardTitle>
            <CardDescription>
              Just the essentials to begin your Heart Lines journey.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-3">
            <SignUpForm />
            <p className="mt-6 text-center text-small text-muted-foreground">
              Already have an account?{' '}
              <Link
                href="/login"
                className="font-medium text-brand-700 underline underline-offset-4 transition-colors hover:text-brand-800"
              >
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
