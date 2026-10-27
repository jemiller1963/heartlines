'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/api-client';
import {
  DistancePreference,
  LifestyleCharacteristic,
  PartnerPreference,
  ProfileCreate,
  type ProfileCreate as ProfileCreateType,
  ProfileItem,
  RelationshipIntent,
  ValuePriority,
} from '@/lib/contracts/profile';
import { applyServerErrors } from '@/lib/forms';
import {
  ONBOARDING_STEP_TITLES,
  type OnboardingStep,
  onboardingProgressPercent,
  resumeOnboardingStep,
} from '@/lib/onboarding';
import { useMountedSession } from '@/lib/use-auth-session';
import { cn } from '@/lib/utils';

const EMPTY_DEFAULTS: ProfileCreateType = {
  displayName: null,
  age: 50,
  location: '',
  interests: [],
  lifestylePreferences: [],
  relationshipIntent: null,
  distancePreference: null,
  lifestyleCharacteristics: [],
  valuesPriorities: [],
  partnerPreferences: [],
  bio: '',
};

const LABELS: Record<string, string> = {
  companionship: 'Companionship',
  romance: 'Romance',
  friendship: 'Friendship',
  'long-term-partnership': 'Long-term partnership',
  'same-city': 'Same city',
  nearby: 'Nearby',
  'within-50-miles': 'Within 50 miles',
  'open-to-distance': 'Open to distance',
  active: 'Active',
  homebody: 'Homebody',
  social: 'Social',
  outdoors: 'Outdoors',
  creative: 'Creative',
  spiritual: 'Spiritual',
  traveler: 'Traveler',
  'pet-friendly': 'Pet-friendly',
  family: 'Family',
  honesty: 'Honesty',
  kindness: 'Kindness',
  humor: 'Humor',
  growth: 'Growth',
  stability: 'Stability',
  independence: 'Independence',
  adventure: 'Adventure',
  communication: 'Communication',
  'emotional-availability': 'Emotional availability',
  'shared-interests': 'Shared interests',
  'active-lifestyle': 'Active lifestyle',
  'family-oriented': 'Family-oriented',
  'open-minded': 'Open-minded',
};

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function OnboardingForm() {
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<ProfileItem | null>(null);
  const [step, setStep] = useState<OnboardingStep>(0);
  const [newInterest, setNewInterest] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const { data: session } = useMountedSession();

  const form = useForm<ProfileCreateType>({
    resolver: zodResolver(ProfileCreate),
    defaultValues: EMPTY_DEFAULTS,
    shouldFocusError: true,
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
            relationshipIntent: data.relationshipIntent ?? null,
            distancePreference: data.distancePreference ?? null,
            lifestyleCharacteristics: data.lifestyleCharacteristics ?? [],
            valuesPriorities: data.valuesPriorities ?? [],
            partnerPreferences: data.partnerPreferences ?? [],
            bio: data.bio ?? '',
          });
          setStep(resumeOnboardingStep(data));
        }
      } catch {
        toast.error('Could not load your profile.');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form]);

  useEffect(() => {
    if (loaded) stepHeadingRef.current?.focus();
  }, [loaded, step]);

  const saveValues = useCallback(
    async (values: ProfileCreateType) => {
      try {
        const savedProfile = await apiFetch<ProfileItem>('/api/profile', {
          method: profile ? 'PATCH' : 'POST',
          body: JSON.stringify(values),
          schema: ProfileItem,
        });
        setProfile(savedProfile);
        form.reset({
          displayName: savedProfile.displayName ?? null,
          age: savedProfile.age,
          location: savedProfile.location,
          interests: savedProfile.interests,
          lifestylePreferences: savedProfile.lifestylePreferences ?? [],
          relationshipIntent: savedProfile.relationshipIntent ?? null,
          distancePreference: savedProfile.distancePreference ?? null,
          lifestyleCharacteristics: savedProfile.lifestyleCharacteristics ?? [],
          valuesPriorities: savedProfile.valuesPriorities ?? [],
          partnerPreferences: savedProfile.partnerPreferences ?? [],
          bio: savedProfile.bio ?? '',
        });
        return true;
      } catch (err) {
        const applied = applyServerErrors((err as Error & { cause?: unknown }).cause, form.setError);
        if (!applied) toast.error('Could not save your profile.');
        return false;
      }
    },
    [form, profile],
  );

  const continueFromStep = useCallback(async () => {
    if (saving) return;

    const fieldsByStep: Array<Array<keyof ProfileCreateType>> = [
      ['age', 'location', 'bio', 'interests'],
      ['distancePreference', 'lifestyleCharacteristics'],
      ['relationshipIntent', 'partnerPreferences'],
      ['valuesPriorities'],
    ];

    const valid = await form.trigger(fieldsByStep[step], { shouldFocus: true });
    if (!valid) return;

    if (step === 1 && !form.getValues('distancePreference')) {
      form.setError(
        'distancePreference',
        { type: 'manual', message: 'Choose how far you are open to connecting' },
        { shouldFocus: true },
      );
      return;
    }
    if (step === 2 && !form.getValues('relationshipIntent')) {
      form.setError(
        'relationshipIntent',
        { type: 'manual', message: 'Choose the kind of connection you are looking for' },
        { shouldFocus: true },
      );
      return;
    }

    setSaving(true);
    try {
      const persisted = await saveValues(form.getValues());
      if (!persisted) return;

      if (step < 3) {
        setSaved(false);
        setStep((step + 1) as OnboardingStep);
        return;
      }

      setSaved(true);
      toast.success('Questionnaire saved.');
    } finally {
      setSaving(false);
    }
  }, [form, saveValues, saving, step]);

  const handleAddInterest = useCallback(() => {
    const trimmed = newInterest.trim();
    if (!trimmed) return;
    const existing = form.getValues('interests') ?? [];
    if (existing.map((value) => value.toLowerCase()).includes(trimmed.toLowerCase())) {
      setNewInterest('');
      return;
    }
    form.setValue('interests', [...existing, trimmed], { shouldValidate: true, shouldDirty: true });
    setNewInterest('');
  }, [form, newInterest]);

  const interests = form.watch('interests') ?? [];

  if (!loaded) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading your profile…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-eyebrow">Welcome</p>
        <h1 className="text-h2 font-bold text-foreground">Tell us about yourself</h1>
        <p className="text-body text-muted-foreground">
          Your answers help Heart Lines understand what matters to you. Matching-only answers stay out of your public profile.
        </p>
        {session?.user ? (
          <p className="text-caption text-muted-foreground">
            Setting up <span className="font-medium text-foreground">{session.user.name || session.user.email || 'your account'}</span>.
          </p>
        ) : null}
      </header>

      <div aria-label="Onboarding progress" className="space-y-2">
        <div className="flex items-center justify-between text-small text-muted-foreground">
          <span>Step {step + 1} of {ONBOARDING_STEP_TITLES.length}</span>
          <span>{ONBOARDING_STEP_TITLES[step]}</span>
        </div>
        <progress className="h-2 w-full" max={100} value={onboardingProgressPercent(step)}>
          {onboardingProgressPercent(step)}%
        </progress>
      </div>

      {profile ? (
        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-h4">Profile photo</CardTitle>
            <CardDescription>A clear, recent photo of you.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileAvatar
              currentUrl={profile.avatarUrl ?? null}
              fallbackInitials={session?.user?.name?.[0] ?? ''}
              onUpdated={setProfile}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader>
          <CardTitle ref={stepHeadingRef} tabIndex={-1} className="text-h4 outline-none">
            {ONBOARDING_STEP_TITLES[step]}
          </CardTitle>
          <CardDescription>
            {step === 0 && 'Start with the basics other members can use to get to know you.'}
            {step === 1 && 'Tell us about your lifestyle and how far you are open to connecting.'}
            {step === 2 && 'Tell us what kind of connection you are looking for.'}
            {step === 3 && 'Choose the values that matter most to you.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void continueFromStep();
              }}
              className="flex flex-col gap-5"
              noValidate
            >
              {step === 0 ? (
                <>
                  <FormField control={form.control} name="age" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Age</FormLabel>
                      <FormControl><Input type="number" inputMode="numeric" min={50} max={120} value={Number.isFinite(field.value) ? String(field.value) : ''} onChange={(e) => field.onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))} /></FormControl>
                      <FormDescription>Heart Lines is for people 50 and older.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="location" render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl><Input autoComplete="address-level2" placeholder="Waynesboro" value={field.value ?? ''} onChange={field.onChange} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="bio" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl><Textarea rows={4} maxLength={500} placeholder="A short introduction about you." value={field.value ?? ''} onChange={field.onChange} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="onboarding-new-interest">Interests</Label>
                    <div className="flex gap-2">
                      <Input id="onboarding-new-interest" value={newInterest} onChange={(e) => setNewInterest(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddInterest(); } }} placeholder="Hiking, jazz, cooking…" />
                      <Button type="button" variant="secondary" onClick={handleAddInterest} disabled={!newInterest.trim()}><Plus aria-hidden="true" />Add</Button>
                    </div>
                    {interests.length ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {interests.map((interest) => (
                          <li key={interest} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-caption font-medium text-brand-800 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100">
                            {interest}
                            <button type="button" aria-label={`Remove ${interest}`} className="ml-1 rounded-full p-0.5" onClick={() => form.setValue('interests', interests.filter((value) => value !== interest), { shouldValidate: true, shouldDirty: true })}><X aria-hidden="true" className="size-3" /></button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="text-small text-muted-foreground">Add at least one interest.</p>}
                    <FormField
                      control={form.control}
                      name="interests"
                      render={() => (
                        <FormItem>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <FormField control={form.control} name="distancePreference" render={({ field }) => (
                    <FormItem>
                      <FormLabel>How far are you open to connecting?</FormLabel>
                      <FormControl>
                        <div role="group" className="grid gap-2 sm:grid-cols-2">
                          {DistancePreference.options.map((option) => (
                            <Button key={option} type="button" variant={field.value === option ? 'default' : 'outline'} aria-pressed={field.value === option} onClick={() => field.onChange(option)}>{LABELS[option]}</Button>
                          ))}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lifestyleCharacteristics" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lifestyle</FormLabel>
                      <FormDescription>Choose any that describe you.</FormDescription>
                      <FormControl>
                        <div role="group" className="flex flex-wrap gap-2">
                          {LifestyleCharacteristic.options.map((option) => {
                            const active = (field.value ?? []).includes(option);
                            return <Button key={option} type="button" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={() => field.onChange(toggleValue(field.value ?? [], option))}>{LABELS[option]}</Button>;
                          })}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <FormField control={form.control} name="relationshipIntent" render={({ field }) => (
                    <FormItem>
                      <FormLabel>What kind of connection are you looking for?</FormLabel>
                      <FormControl>
                        <div role="group" className="grid gap-2 sm:grid-cols-2">
                          {RelationshipIntent.options.map((option) => <Button key={option} type="button" variant={field.value === option ? 'default' : 'outline'} aria-pressed={field.value === option} onClick={() => field.onChange(option)}>{LABELS[option]}</Button>)}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="partnerPreferences" render={({ field }) => (
                    <FormItem>
                      <FormLabel>What qualities matter to you in a partner?</FormLabel>
                      <FormDescription>Choose up to eight.</FormDescription>
                      <FormControl>
                        <div role="group" className="flex flex-wrap gap-2">
                          {PartnerPreference.options.map((option) => {
                            const active = (field.value ?? []).includes(option);
                            return <Button key={option} type="button" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={() => field.onChange(toggleValue(field.value ?? [], option))}>{LABELS[option]}</Button>;
                          })}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              ) : null}

              {step === 3 ? (
                <FormField control={form.control} name="valuesPriorities" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Which values matter most to you?</FormLabel>
                    <FormDescription>Choose up to eight.</FormDescription>
                    <FormControl>
                      <div role="group" className="flex flex-wrap gap-2">
                        {ValuePriority.options.map((option) => {
                          const active = (field.value ?? []).includes(option);
                          return <Button key={option} type="button" variant={active ? 'default' : 'outline'} aria-pressed={active} onClick={() => field.onChange(toggleValue(field.value ?? [], option))}>{LABELS[option]}</Button>;
                        })}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ) : null}

              <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
                <Button type="button" variant="outline" onClick={() => { setSaved(false); setStep((Math.max(0, step - 1)) as OnboardingStep); }} disabled={step === 0 || saving}>Back</Button>
                <Button type="submit" disabled={saving} size="lg">
                  {saving ? 'Saving…' : step === 3 ? 'Save questionnaire' : 'Save and continue'}
                </Button>
              </div>
              <p aria-live="polite" className={cn('text-small text-muted-foreground', !saved && 'sr-only')}>
                {saved ? 'Your questionnaire is saved. Review submission will happen in the next step of onboarding.' : ''}
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
