// @polsia:user-owned — Onboarding form island rendered by the route page.
// Loads the existing profile via GET /api/profile on mount so a returning
// user (e.g. sign-in after a row already exists) pre-fills, then posts (or
// patches on 409) and advances to /feed.

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { DashboardShell } from '@/components/custom/dashboard/dashboard-shell';
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
  ProfileCreate,
  type ProfileCreate as ProfileCreateType,
  ProfileItem,
} from '@/lib/contracts/profile';
import { applyServerErrors } from '@/lib/forms';
import { useMountedSession } from '@/lib/use-auth-session';
import { cn } from '@/lib/utils';

const EMPTY_DEFAULTS: ProfileCreateType = {
  age: 50,
  location: '',
  interests: [],
  bio: '',
};

export function OnboardingForm() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<ProfileItem | null>(null);
  const [newInterest, setNewInterest] = useState('');
  const form = useForm<ProfileCreateType>({
    resolver: zodResolver(ProfileCreate),
    defaultValues: EMPTY_DEFAULTS,
  });
  const { data: session } = useMountedSession();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<ProfileItem | null>('/api/profile', {
          method: 'GET',
          schema: ProfileItem.nullable(),
        });
        if (cancelled) return;
        if (data) {
          setProfile(data);
          form.reset({
            age: data.age,
            location: data.location,
            interests: data.interests,
            bio: data.bio ?? '',
          });
        }
        setLoaded(true);
      } catch (err) {
        // 204 = no profile yet — empty form is the correct initial render.
        if ((err as Error).message?.includes('(204)')) {
          setLoaded(true);
          return;
        }
        toast.error('Could not load your profile.');
        setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form]);

  const submit = useCallback(
    async (values: ProfileCreateType) => {
      try {
        const saved = await apiFetch<ProfileItem>('/api/profile', {
          method: 'POST',
          body: JSON.stringify(values),
          schema: ProfileItem,
        });
        setProfile(saved);
        toast.success('Profile saved — taking you to your matches.');
        router.replace('/feed');
      } catch (err) {
        const message = (err as Error).message ?? '';
        const body = (err as Error & { cause?: unknown }).cause;
        if (message.includes('(409)')) {
          try {
            const saved = await apiFetch<ProfileItem>('/api/profile', {
              method: 'PATCH',
              body: JSON.stringify(values),
              schema: ProfileItem,
            });
            setProfile(saved);
            toast.success('Profile saved — taking you to your matches.');
            router.replace('/feed');
          } catch (patchErr) {
            applyServerErrors((patchErr as Error & { cause?: unknown }).cause, form.setError);
            toast.error('Could not save your profile.');
          }
          return;
        }
        if (message.includes('(400)') && body) {
          applyServerErrors(body, form.setError);
          return;
        }
        toast.error('Could not save your profile.');
      }
    },
    [form, router],
  );

  const handleAddInterest = useCallback(() => {
    const trimmed = newInterest.trim();
    if (!trimmed) return;
    const existing = form.getValues('interests');
    const lowered = existing.map((s) => s.toLowerCase());
    if (lowered.includes(trimmed.toLowerCase())) {
      setNewInterest('');
      return;
    }
    form.setValue('interests', [...existing, trimmed], { shouldValidate: true });
    setNewInterest('');
  }, [form, newInterest]);

  const watchInterests = form.watch('interests');
  const interestsValue = useMemo(() => watchInterests ?? [], [watchInterests]);

  if (!loaded) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Loading your profile…
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <header className="flex flex-col gap-1">
          <p className="text-eyebrow">Welcome</p>
          <h1 className="text-h2 font-bold text-foreground">Let's set up your profile</h1>
          <p className="text-body text-muted-foreground">
            A few quick details so we can introduce you to people you'd genuinely click with.
          </p>
          {session?.user ? (
            <p className="text-caption text-muted-foreground">
              Setting up{' '}
              <span className="font-medium text-foreground">
                {session.user.name || session.user.email || 'your account'}
              </span>
              . To change your display name, visit your account settings.
            </p>
          ) : null}
        </header>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-h4">Profile photo</CardTitle>
            <CardDescription>
              A clear, recent photo of you — we'll show it on your matches' queue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileAvatar
              currentUrl={profile?.avatarUrl ?? null}
              fallbackInitials={session?.user?.name?.[0] ?? ''}
              onUpdated={(item) => {
                setProfile(item);
                form.reset({ ...item, bio: item.bio ?? '' });
              }}
            />
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-h4">The basics</CardTitle>
            <CardDescription>
              You can edit any of this from your profile at any time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-5">
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
                          value={Number.isFinite(field.value) ? String(field.value) : ''}
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
                  <FormLabel htmlFor="onboarding-new-interest">Interests</FormLabel>
                  <div className="flex gap-2">
                    <Input
                      id="onboarding-new-interest"
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
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-caption font-medium text-brand-800',
                            'dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100',
                          )}
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
                  <FormField
                    control={form.control}
                    name="interests"
                    render={() => <FormMessage />}
                  />
                </div>

                <div className="flex justify-end gap-3 border-t border-border pt-5">
                  <Button type="submit" disabled={form.formState.isSubmitting} size="lg">
                    {form.formState.isSubmitting ? 'Saving…' : 'Continue to discovery'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
