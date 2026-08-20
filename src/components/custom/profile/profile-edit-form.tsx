// @polsia:user-owned — Profile editor island for /profile/edit.
//
// On mount, fetches /api/profile via apiFetch. 204 = no profile yet; in
// that case the user is mid-onboarding and this editor isn't the right
// surface, so we render a soft redirect prompt back to /onboarding. On
// 200, the form is reset to the returned ProfileItem so changes happen
// in-place. Submit → PATCH /api/profile → on 200, router.replace to
// /profile/<ownUserId>. The existing <ProfileAvatar /> handles photo
// upload via the sin-gle /api/profile/avatar multipart route — the
// avatar POST/DELETE responses also return full ProfileItem-shaped
// payloads so onUpdated can refresh this form's cached state.
//
// Data plane: this island must NOT import server-only modules. The
// biome `noRestrictedImports` gate HARD-FAILS this file if it ever
// imports `@/lib/db` / `@prisma/client` / `server-only` /
// `next/headers`.

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, Save, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { ProfileAvatar } from '@/components/custom/profile-avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import {
  ProfileItem,
  ProfilePatch,
  type ProfilePatch as ProfilePatchType,
} from '@/lib/contracts/profile';
import { applyServerErrors } from '@/lib/forms';
import { useMountedSession } from '@/lib/use-auth-session';
import { cn } from '@/lib/utils';

const LIFESTYLE_OPTIONS = [
  'Early bird',
  'Night owl',
  'Pet-friendly',
  'Non-smoker',
  'Vegetarian',
  'Social drinker',
  'Quiet home',
  'Active outdoors',
  'Reader',
  'Live music',
  'Coffee over wine',
  'Travel often',
] as const;

const EMPTY_DEFAULTS: ProfilePatchType = {
  displayName: null,
  age: 50,
  location: '',
  interests: [],
  lifestylePreferences: [],
  bio: '',
};

type LoadState = 'loading' | 'ready' | 'no-profile' | 'error';

export function ProfileEditForm() {
  const router = useRouter();
  const { data: session } = useMountedSession();
  const [state, setState] = useState<LoadState>('loading');
  const [profile, setProfile] = useState<ProfileItem | null>(null);
  const [newInterest, setNewInterest] = useState('');

  const form = useForm<ProfilePatchType>({
    resolver: zodResolver(ProfilePatch),
    defaultValues: EMPTY_DEFAULTS,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<ProfileItem | null>('/api/profile', {
          method: 'GET',
          schema: ProfileItem.nullable(),
        });
        if (cancelled) return;
        if (data) {
          setProfile(data);
          form.reset({
            displayName: data.displayName ?? null,
            age: data.age,
            location: data.location,
            interests: data.interests,
            lifestylePreferences: data.lifestylePreferences ?? [],
            bio: data.bio ?? '',
          });
          setState('ready');
        } else {
          setState('no-profile');
        }
      } catch (err) {
        if (cancelled) return;
        const status = (err as Error).message?.match(/\((\d{3})\)/)?.[1];
        if (status === '204') {
          setState('no-profile');
          return;
        }
        setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form]);

  const handleSubmit = useCallback(
    async (values: ProfilePatchType) => {
      try {
        const updated = await apiFetch<ProfileItem>('/api/profile', {
          method: 'PATCH',
          body: JSON.stringify({
            ...values,
            displayName:
              values.displayName === '' || values.displayName === undefined
                ? null
                : values.displayName,
            lifestylePreferences: values.lifestylePreferences ?? [],
          }),
          schema: ProfileItem,
        });
        setProfile(updated);
        form.reset({
          displayName: updated.displayName ?? null,
          age: updated.age,
          location: updated.location,
          interests: updated.interests,
          lifestylePreferences: updated.lifestylePreferences ?? [],
          bio: updated.bio ?? '',
        });
        toast.success('Profile saved.');
        if (session?.user?.id) {
          router.replace(`/profile/${session.user.id}`);
        }
      } catch (err) {
        const cause = (err as Error & { cause?: unknown }).cause;
        const applied = applyServerErrors(cause, form.setError);
        if (!applied) {
          toast.error('Could not save your changes.');
        }
      }
    },
    [form, router, session?.user?.id],
  );

  const handleAddInterest = useCallback(() => {
    const trimmed = newInterest.trim();
    if (!trimmed) return;
    const existing = form.getValues('interests') ?? [];
    if (existing.map((s) => s.toLowerCase()).includes(trimmed.toLowerCase())) {
      setNewInterest('');
      return;
    }
    form.setValue('interests', [...existing, trimmed], { shouldValidate: true });
    setNewInterest('');
  }, [form, newInterest]);

  const watchInterests = form.watch('interests');
  const watchLifestyle = form.watch('lifestylePreferences');
  const interestsValue = useMemo(() => watchInterests ?? [], [watchInterests]);
  const lifestyleValue = useMemo(() => watchLifestyle ?? [], [watchLifestyle]);

  const toggleLifestyle = useCallback(
    (option: string) => {
      const current = form.getValues('lifestylePreferences') ?? [];
      const has = current.includes(option);
      const next = has ? current.filter((v) => v !== option) : [...current, option];
      form.setValue('lifestylePreferences', next, { shouldValidate: true });
    },
    [form],
  );

  const fallbackName = session?.user?.name ?? session?.user?.email ?? '';
  const fallbackInitials = fallbackName[0]?.toUpperCase() ?? '';

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Loading your profile…
      </div>
    );
  }

  if (state === 'no-profile') {
    return (
      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-h3 font-bold">Finish onboarding first</CardTitle>
          <CardDescription>
            You haven&apos;t created a matching profile yet. Once you finish onboarding, you can
            come back here to fine-tune the details.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/onboarding">Resume onboarding</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state === 'error') {
    return (
      <Card className="border-border/70 bg-card shadow-sm" role="alert">
        <CardHeader>
          <CardTitle className="text-h3 font-bold">We couldn&apos;t load your profile</CardTitle>
          <CardDescription>Refresh the page to try again.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-eyebrow">Your profile</p>
        <h1 className="text-h2 font-bold text-foreground">Edit your profile</h1>
        <p className="text-body text-muted-foreground">
          Update your display name, photo, and the details other members see. Changes save with one
          click.
        </p>
      </header>

      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-h4">Profile photo</CardTitle>
          <CardDescription>
            A clear, recent photo of you — visible alongside your name across Heart Lines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileAvatar
            currentUrl={profile?.avatarUrl ?? null}
            fallbackInitials={fallbackInitials}
            onUpdated={(item) => {
              setProfile(item);
              form.reset({
                displayName: item.displayName ?? null,
                age: item.age,
                location: item.location,
                interests: item.interests,
                lifestylePreferences: item.lifestylePreferences ?? [],
                bio: item.bio ?? '',
              });
            }}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-h4">The basics</CardTitle>
          <CardDescription>
            These details are shared with the other members of Heart Lines.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="flex flex-col gap-5"
              noValidate
            >
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          session?.user?.name
                            ? `Leave blank to show "${session.user.name}"`
                            : 'How other members see you'
                        }
                        maxLength={80}
                        value={field.value ?? ''}
                        onChange={(e) => field.onChange(e.target.value)}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. Leave blank to use your account name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Age</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={18}
                        max={120}
                        value={
                          Number.isFinite(field.value ?? Number.NaN) ? String(field.value) : ''
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === '' ? Number.NaN : Number(v));
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Paris"
                        autoComplete="address-level2"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>
                      Two members in the same city score higher on compatibility.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bio</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="A short line or two about what you're looking for."
                        rows={3}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-col gap-2">
                <FormLabel htmlFor="new-interest">Interests</FormLabel>
                <div className="flex gap-2">
                  <Input
                    id="new-interest"
                    placeholder="Hiking, jazz, cooking…"
                    value={newInterest}
                    onChange={(e) => setNewInterest(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddInterest();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleAddInterest}
                    disabled={!newInterest.trim()}
                  >
                    <Plus aria-hidden="true" />
                    Add
                  </Button>
                </div>
                {interestsValue.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {interestsValue.map((interest) => (
                      <li
                        key={interest}
                        className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-caption font-medium text-brand-800 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100"
                      >
                        {interest}
                        <button
                          type="button"
                          aria-label={`Remove ${interest}`}
                          className="ml-1 rounded-full p-0.5 transition-colors hover:bg-brand-200/70 dark:hover:bg-brand-800/70"
                          onClick={() => {
                            const current = form.getValues('interests') ?? [];
                            form.setValue(
                              'interests',
                              current.filter((v) => v !== interest),
                              { shouldValidate: true },
                            );
                          }}
                        >
                          <X aria-hidden="true" className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-small text-muted-foreground">
                    Add at least one interest — shared hobbies drive the match score.
                  </p>
                )}
                <FormField control={form.control} name="interests" render={() => <FormMessage />} />
              </div>

              <div className="flex flex-col gap-2">
                <FormLabel>Lifestyle preferences</FormLabel>
                <FormDescription>
                  Tick the boxes that fit. The compatibility algorithm uses these to find closer
                  matches.
                </FormDescription>
                <ul className="flex flex-wrap gap-1.5">
                  {LIFESTYLE_OPTIONS.map((option) => {
                    const active = lifestyleValue.includes(option);
                    return (
                      <li key={option}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleLifestyle(option)}
                          className={cn(
                            'inline-flex items-center rounded-full border px-3 py-1.5 text-caption font-medium transition-colors',
                            active
                              ? 'border-brand-500 bg-brand-500 text-primary-foreground shadow-sm hover:bg-brand-600'
                              : 'border-border bg-secondary text-secondary-foreground hover:bg-secondary/70',
                          )}
                        >
                          {option}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                <FormField
                  control={form.control}
                  name="lifestylePreferences"
                  render={() => <FormMessage />}
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                <Button asChild variant="outline">
                  <Link href={session?.user?.id ? `/profile/${session.user.id}` : '/dashboard'}>
                    Cancel
                  </Link>
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting} size="lg">
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      Saving…
                    </>
                  ) : (
                    <>
                      <Save aria-hidden="true" />
                      Save changes
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
