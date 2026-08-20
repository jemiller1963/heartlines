// @polsia:user-owned — resets a user's password from the email link. Server
// Component exporting metadata; renders the client island in a <Suspense>
// boundary (required when the island reads useSearchParams during static
// prerender). When the link is expired, better-auth's GET /reset-password/:token
// endpoint redirects here with ?error=INVALID_TOKEN and the island routes the
// visitor back to /forgot-password.

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password',
  description: 'Choose a new password for your Heart Lines account.',
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-gutter py-section bg-[var(--background)]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-30%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-[var(--brand-100)] opacity-40 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[var(--brand-200)] opacity-30 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md shadow-brand border border-border/60 bg-card/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-2">
          <CardTitle className="text-h4">Choose a new password</CardTitle>
          <CardDescription>
            Pick something strong — at least 8 characters you don&apos;t use elsewhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Suspense fallback={null}>
            <ResetPasswordForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
