// @polsia:user-owned — forgot-password entry point. Server Component exporting
// metadata; renders the client island inside the same Card shell as login/signup
// (matching brand styling). The island fires authClient.requestPasswordReset.

import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ForgotPasswordForm } from './forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password',
  description: 'Recover access to your Heart Lines account.',
  robots: { index: false },
};

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-gutter py-section bg-[var(--background)]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-30%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-[var(--brand-100)] opacity-40 blur-3xl" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[var(--brand-200)] opacity-30 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md shadow-brand border border-border/60 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-h4">Forgot your password?</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a link to choose a new one.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <ForgotPasswordForm />
          <p className="mt-4 text-center text-small text-muted-foreground">
            Remembered it?{' '}
            <a
              href="/login"
              className="text-brand-600 font-medium hover:text-brand-700 hover:underline underline-offset-2 transition-colors"
            >
              Back to sign in
            </a>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
