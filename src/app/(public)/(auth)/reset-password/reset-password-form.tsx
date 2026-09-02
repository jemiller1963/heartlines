// @polsia:user-owned
'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';

// Reset-password form. Reads ?token (and ?error=INVALID_TOKEN when the link
// expired) from useSearchParams; better-auth stores the reset token in a
// Verification row keyed by `reset-password:<token>` and binds the page to it.
//
// Submitted via authClient.resetPassword({ token, newPassword }); success
// causes a row delete on the verification + a new password hash on the
// Account row, then we route the visitor to /login.
//
// We require new == confirm in the UI before even calling better-auth — better
// auth's own validator will also reject mismatched/short passwords; the
// pre-check shortens the round-trip for the common case.

type Status = { kind: 'idle' } | { kind: 'expired' } | { kind: 'missing' };

type ErrorWithMessage = { message?: string };

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as ErrorWithMessage;
    if (typeof e.message === 'string' && e.message.length > 0) return e.message;
  }
  return "We couldn't update your password. Please try the link in your email again.";
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialStatus = useMemo<Status>(() => {
    const error = params.get('error');
    if (error === 'INVALID_TOKEN') return { kind: 'expired' };
    if (!params.get('token')) return { kind: 'missing' };
    return { kind: 'idle' };
  }, [params]);

  const [status, setStatus] = useState<Status>(initialStatus);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pending, setPending] = useState(false);
  const [mismatch, setMismatch] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // If the user lands on /reset-password with no token AND no error, push
  // them to forgot-password so the empty form never sits there misleadingly.
  useEffect(() => {
    if (initialStatus.kind === 'missing') {
      router.replace('/forgot-password');
    } else {
      setStatus(initialStatus);
    }
  }, [initialStatus, router]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (status.kind !== 'idle') return;

    if (password.length < 8) {
      setMismatch('Pick at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setMismatch("Those passwords don't match.");
      return;
    }

    setMismatch(undefined);
    setPending(true);
    setError(undefined);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const token = params.get('token');
      if (!token) {
        setStatus({ kind: 'missing' });
        return;
      }
      const { error: updateError } = await authClient.resetPassword({
        token,
        newPassword: password,
        fetchOptions: { signal: controller.signal },
      });
      if (updateError) {
        setError(updateError.message ?? "We couldn't update your password. Please try again.");
        return;
      }
      toast.success('Password updated. Sign in to continue.');
      router.replace('/login');
    } catch (err) {
      const aborted = isAbortError(err) || controller.signal.aborted;
      const message = aborted ? "Update didn't complete. Please try again." : getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
    }
  }

  if (status.kind === 'expired') {
    return (
      <output className="flex flex-col gap-3 text-center">
        <p className="text-body">This password-reset link has expired or already been used.</p>
        <p className="text-small text-muted-foreground">Click below to receive a fresh one.</p>
        <Button asChild className="w-full">
          <Link href="/forgot-password">Send a new reset link</Link>
        </Button>
      </output>
    );
  }

  if (status.kind === 'missing') {
    // The useEffect above is replacing the route; render a brief loading hint
    // rather than a flicker of form fields.
    return (
      <output className="block text-small text-muted-foreground text-center">
        Redirecting to the reset page…
      </output>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <Label htmlFor="reset-password-new">New password</Label>
      <Input
        id="reset-password-new"
        name="new-password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setMismatch(undefined);
        }}
        required
        minLength={8}
        aria-invalid={mismatch || error ? true : undefined}
      />
      <Label htmlFor="reset-password-confirm">Confirm new password</Label>
      <Input
        id="reset-password-confirm"
        name="confirm-password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => {
          setConfirm(e.target.value);
          setMismatch(undefined);
        }}
        required
        minLength={8}
        aria-invalid={mismatch || error ? true : undefined}
      />
      {mismatch ? (
        <p className="text-sm text-destructive">{mismatch}</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Updating…' : 'Update password'}
      </Button>
    </form>
  );
}
