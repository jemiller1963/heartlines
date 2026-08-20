// @polsia:user-owned
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

// Forgot-password entry. Submits the email to better-auth's
// /request-password-reset (proxied through authClient.requestPasswordReset);
// better-auth generates the verification token, writes the Verification row,
// then calls our sendResetPassword callback in @/lib/auth-config to mail the
// reset link. The endpoint always returns 200 with the same generic message,
// so we render one success state regardless of whether that address exists —
// prevents account enumeration via UI timing.
type ErrorWithMessage = { message?: string };

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as ErrorWithMessage;
    if (typeof e.message === 'string' && e.message.length > 0) return e.message;
  }
  return 'Could not send reset link. Please try again.';
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const { error: resetError } = await authClient.requestPasswordReset({
        email,
        redirectTo: '/reset-password',
        fetchOptions: { signal: controller.signal },
      });
      if (resetError) {
        setError(resetError.message ?? 'Could not send reset link. Please try again.');
        return;
      }
      setSubmitted(true);
    } catch (err) {
      const aborted = isAbortError(err) || controller.signal.aborted;
      const message = aborted
        ? "The request didn't complete. Please try again."
        : getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
    }
  }

  if (submitted) {
    return (
      <output className="flex flex-col gap-3 text-center">
        <p className="text-body">
          If an account exists for <span className="font-medium">{email}</span>, we&apos;ve sent a
          password-reset link to it. The link expires in about an hour.
        </p>
        <p className="text-small text-muted-foreground">
          Didn&apos;t get one? Check your spam folder, or{' '}
          <button
            type="button"
            onClick={() => setSubmitted(false)}
            className="text-brand-600 font-medium hover:text-brand-700 hover:underline underline-offset-2 transition-colors"
          >
            try a different email
          </button>
          .
        </p>
      </output>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <Label htmlFor="forgot-password-email">Email address</Label>
      <Input
        id="forgot-password-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Sending link…' : 'Send reset link'}
      </Button>
    </form>
  );
}
