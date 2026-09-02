// @polsia:user-owned
'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch } from '@/lib/api-client';
import { signIn } from '@/lib/auth-client';
import { MemberEntryResponse } from '@/lib/contracts/member-entry';

// Email + password sign-in. Composes the template's base shadcn primitives
// (Button/Input/Label) styled through the theme tokens. Restyle freely — this
// file is user-owned. Calls better-auth's authClient.signIn.email; on success
// the session cookie is set by the catch-all route handler and the page reloads.
//
// Submit hardening: `pending` resets in `finally` so the button is re-clickable
// on every exit path. A 15s AbortController timeout catches deploy-mid-rollout
// / wrong-public-URL stalls. Toasts surface transport failures; inline errors
// still render for resolved better-auth validation results.
type ErrorWithMessage = { message?: string };

function getErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as ErrorWithMessage;
    if (typeof e.message === 'string' && e.message.length > 0) return e.message;
  }
  return 'Sign-in failed. Please try again.';
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(undefined);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const { error: signInError } = await signIn.email({
        email,
        password,
        fetchOptions: { signal: controller.signal },
      });
      if (signInError) {
        setError(signInError.message ?? 'Could not sign in. Check your details.');
        return;
      }
      const entry = await apiFetch('/api/member-entry', { schema: MemberEntryResponse });
      window.location.assign(entry.destination);
    } catch (err) {
      const aborted = isAbortError(err) || controller.signal.aborted;
      const message = aborted ? "Sign-in didn't complete. Please try again." : getErrorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <Label htmlFor="sign-in-email">Email address</Label>
      <Input
        id="sign-in-email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
      />
      <Label htmlFor="sign-in-password">Password</Label>
      <Input
        id="sign-in-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
