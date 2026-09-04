// @polsia:user-owned
'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUp } from '@/lib/auth-client';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type SignupField = 'name' | 'email' | 'password' | 'age' | 'terms';
type FieldErrors = Partial<Record<SignupField, string>>;
type BetterAuthError = { code?: string };

const FIELD_IDS: Record<SignupField, string> = {
  name: 'sign-up-name',
  email: 'sign-up-email',
  password: 'sign-up-password',
  age: 'sign-up-age-confirmation',
  terms: 'sign-up-terms-confirmation',
};

// Email + password sign-up. This island owns only the minimum auth fields;
// profile details are collected by the existing /onboarding flow after account
// creation. Calls better-auth's authClient.signUp.email and advances directly
// to /onboarding after the catch-all route establishes the session.
//
// Submit hardening: `pending` resets in `finally` so the button is re-clickable
// on every exit path. A 15s AbortController timeout catches deploy-mid-rollout
// / wrong-public-URL stalls. Toasts surface transport failures; resolved
// Better Auth failures stay in the focused, announced form error area.

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: string }).name;
  return name === 'AbortError' || name === 'TimeoutError';
}

function getBetterAuthError(err: unknown): { field?: SignupField; message: string } {
  const code =
    err && typeof err === 'object' && typeof (err as BetterAuthError).code === 'string'
      ? (err as BetterAuthError).code
      : undefined;

  switch (code) {
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return {
        field: 'email',
        message: 'An account with this email already exists. Try signing in instead.',
      };
    case 'INVALID_EMAIL':
      return { field: 'email', message: 'Enter a valid email address.' };
    case 'PASSWORD_TOO_SHORT':
      return { field: 'password', message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
    case 'PASSWORD_TOO_LONG':
      return { field: 'password', message: `Use no more than ${MAX_PASSWORD_LENGTH} characters.` };
    case 'INVALID_PASSWORD':
      return { field: 'password', message: 'Choose a different password and try again.' };
    case 'RATE_LIMITED':
      return { message: 'Too many attempts. Please wait a moment and try again.' };
    default:
      return {
        message: 'We couldn’t create your account. Please check your details and try again.',
      };
  }
}

function validateSignup({
  name,
  email,
  password,
  ageConfirmed,
  termsConfirmed,
}: {
  name: string;
  email: string;
  password: string;
  ageConfirmed: boolean;
  termsConfirmed: boolean;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) errors.name = 'Enter your name.';
  if (!email.trim()) {
    errors.email = 'Enter your email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address.';
  }
  if (!password) {
    errors.password = 'Create a password.';
  } else if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    errors.password = `Your password must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`;
  }
  if (!ageConfirmed) errors.age = 'Please confirm that you are at least 50 years old.';
  if (!termsConfirmed) errors.terms = 'Please agree to the Terms and review the Privacy Policy.';
  return errors;
}

export function SignUpForm() {
  const router = useRouter();
  const alertRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [termsConfirmed, setTermsConfirmed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);

  function focusField(field: SignupField) {
    window.requestAnimationFrame(() => {
      document.getElementById(FIELD_IDS[field])?.focus();
    });
  }

  function focusAlert() {
    window.requestAnimationFrame(() => alertRef.current?.focus());
  }

  function clearFieldError(field: SignupField) {
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(undefined);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const validationErrors = validateSignup({
      name,
      email,
      password,
      ageConfirmed,
      termsConfirmed,
    });
    setErrors(validationErrors);
    setFormError(undefined);
    const firstInvalidField = (Object.keys(FIELD_IDS) as SignupField[]).find(
      (field) => validationErrors[field],
    );
    if (firstInvalidField) {
      focusField(firstInvalidField);
      return;
    }

    setPending(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
      const { error: signUpError } = await signUp.email({
        name: name.trim(),
        email: email.trim(),
        password,
        fetchOptions: { signal: controller.signal },
      });
      if (signUpError) {
        const translated = getBetterAuthError(signUpError);
        if (translated.field) {
          setErrors({ [translated.field]: translated.message });
          focusField(translated.field);
        } else {
          setFormError(translated.message);
          focusAlert();
        }
        return;
      }
      router.replace('/onboarding');
    } catch (err) {
      const aborted = isAbortError(err) || controller.signal.aborted;
      const message = aborted
        ? 'Sign-up didn’t complete. Please try again.'
        : 'We couldn’t create your account right now. Please try again.';
      setFormError(message);
      focusAlert();
      toast.error(message);
    } finally {
      clearTimeout(timeoutId);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <p id="sign-up-required-note" className="text-small text-muted-foreground">
        Required fields are marked <span aria-hidden="true">*</span>.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-up-name">
          Name <span aria-hidden="true">*</span>
          <span className="sr-only"> required</span>
        </Label>
        <Input
          id="sign-up-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearFieldError('name');
          }}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.name)}
          aria-describedby={`sign-up-required-note sign-up-name-help${errors.name ? ' sign-up-name-error' : ''}`}
        />
        <p id="sign-up-name-help" className="text-small text-muted-foreground">
          Use the name you would like members to see later in your profile.
        </p>
        {errors.name ? (
          <p id="sign-up-name-error" className="text-small text-destructive">
            Error: {errors.name}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-up-email">
          Email address <span aria-hidden="true">*</span>
          <span className="sr-only"> required</span>
        </Label>
        <Input
          id="sign-up-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clearFieldError('email');
          }}
          required
          aria-required="true"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={`sign-up-required-note sign-up-email-help${errors.email ? ' sign-up-email-error' : ''}`}
        />
        <p id="sign-up-email-help" className="text-small text-muted-foreground">
          We&apos;ll use this to help you sign in to Heart Lines.
        </p>
        {errors.email ? (
          <p id="sign-up-email-error" className="text-small text-destructive">
            Error: {errors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sign-up-password">
          Password <span aria-hidden="true">*</span>
          <span className="sr-only"> required</span>
        </Label>
        <div className="relative">
          <Input
            id="sign-up-password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearFieldError('password');
            }}
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            aria-required="true"
            aria-invalid={Boolean(errors.password)}
            aria-describedby={`sign-up-required-note sign-up-password-help${errors.password ? ' sign-up-password-error' : ''}`}
            className="pr-12"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </Button>
        </div>
        <p id="sign-up-password-help" className="text-small text-muted-foreground">
          Use 8–128 characters. You can include spaces or punctuation.
        </p>
        {errors.password ? (
          <p id="sign-up-password-error" className="text-small text-destructive">
            Error: {errors.password}
          </p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-4 border-t border-border pt-5">
        <legend className="text-body font-medium text-foreground">Before you continue</legend>
        <div className="flex items-start gap-3">
          <Checkbox
            id="sign-up-age-confirmation"
            checked={ageConfirmed}
            onCheckedChange={(checked) => {
              setAgeConfirmed(checked === true);
              clearFieldError('age');
            }}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.age)}
            aria-describedby={`sign-up-age-help${errors.age ? ' sign-up-age-error' : ''}`}
            className="mt-1"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="sign-up-age-confirmation" className="font-normal leading-6">
              I confirm I am at least 50 years old <span aria-hidden="true">*</span>
              <span className="sr-only"> required</span>
            </Label>
            <p id="sign-up-age-help" className="text-small text-muted-foreground">
              Heart Lines is exclusively for adults age 50 and older.
            </p>
            {errors.age ? (
              <p id="sign-up-age-error" className="text-small text-destructive">
                Error: {errors.age}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="sign-up-terms-confirmation"
            checked={termsConfirmed}
            onCheckedChange={(checked) => {
              setTermsConfirmed(checked === true);
              clearFieldError('terms');
            }}
            required
            aria-required="true"
            aria-invalid={Boolean(errors.terms)}
            aria-describedby={`sign-up-terms-help${errors.terms ? ' sign-up-terms-error' : ''}`}
            className="mt-1"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor="sign-up-terms-confirmation" className="font-normal leading-6">
              I agree to the Terms of Service and confirm I have reviewed the Privacy Policy{' '}
              <span aria-hidden="true">*</span>
              <span className="sr-only"> required</span>
            </Label>
            <p id="sign-up-terms-help" className="text-small text-muted-foreground">
              Review the{' '}
              <Link
                href="/terms"
                className="font-medium text-brand-700 underline underline-offset-4"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="font-medium text-brand-700 underline underline-offset-4"
              >
                Privacy Policy
              </Link>{' '}
              before continuing.
            </p>
            {errors.terms ? (
              <p id="sign-up-terms-error" className="text-small text-destructive">
                Error: {errors.terms}
              </p>
            ) : null}
          </div>
        </div>
      </fieldset>

      {formError ? (
        <Alert
          ref={alertRef}
          variant="destructive"
          aria-live="assertive"
          tabIndex={-1}
          id="sign-up-form-error"
        >
          <AlertTitle>We couldn’t create your account</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" disabled={pending} className="w-full" size="lg">
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
