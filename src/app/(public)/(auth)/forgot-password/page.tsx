// @polsia:user-owned — forgot-password page.

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
