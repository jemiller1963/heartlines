// @polsia:user-owned — Privacy controls settings page.
//
// Gated by the `(dashboard)/**` layout (redirects to /login when unauth).
// Loads current prefs from GET /api/user/privacy on mount, then PATCHes the
// form with `applyServerErrors` + sonner toasts for feedback. The page makes
// no DB / fetch calls of its own beyond going through apiFetch.

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
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
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { apiFetch } from '@/lib/api-client';
import { PrivacyItem, PrivacyPatch } from '@/lib/contracts/privacy';
import { applyServerErrors } from '@/lib/forms';

type PrivacyValues = z.infer<typeof PrivacyPatch>;

const privacyDefaults: PrivacyValues = {
  profilePublic: true,
  hideLastActive: false,
  hideReadReceipts: false,
};

type LoadState = 'loading' | 'ready' | 'error';

export default function PrivacySettingsPage() {
  const [state, setState] = useState<LoadState>('loading');
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<PrivacyValues>({
    resolver: zodResolver(PrivacyPatch),
    defaultValues: privacyDefaults,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const item = await apiFetch('/api/user/privacy', { schema: PrivacyItem });
        if (cancelled) return;
        form.reset({
          profilePublic: item.profilePublic ?? privacyDefaults.profilePublic,
          hideLastActive: item.hideLastActive ?? privacyDefaults.hideLastActive,
          hideReadReceipts: item.hideReadReceipts ?? privacyDefaults.hideReadReceipts,
        });
        setState('ready');
      } catch {
        if (cancelled) return;
        setState('error');
        toast.error('Could not load your privacy settings');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setSubmitting(true);
    try {
      const updated = await apiFetch('/api/user/privacy', {
        method: 'PATCH',
        body: JSON.stringify(values),
        schema: PrivacyItem,
      });
      form.reset({
        profilePublic: updated.profilePublic ?? privacyDefaults.profilePublic,
        hideLastActive: updated.hideLastActive ?? privacyDefaults.hideLastActive,
        hideReadReceipts: updated.hideReadReceipts ?? privacyDefaults.hideReadReceipts,
      });
      toast.success('Privacy settings saved');
    } catch (err) {
      const cause = (err as { cause?: unknown })?.cause;
      const applied = applyServerErrors(cause, form.setError);
      if (!applied) {
        toast.error('Could not save privacy settings');
      }
    } finally {
      setSubmitting(false);
    }
  });

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        Loading your privacy settings…
      </div>
    );
  }

  if (state === 'error') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>
            We couldn’t load your saved privacy settings. Refresh the page to try again.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Privacy</h1>
        <p className="text-sm text-muted-foreground">
          Choose how others see you on Heart Lines. Changes save instantly.
        </p>
      </header>

      <Form {...form}>
        <form onSubmit={onSubmit} className="grid gap-6" noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Visibility</CardTitle>
              <CardDescription>Control what other members can learn about you.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <FormField
                control={form.control}
                name="profilePublic"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start justify-between gap-6 space-y-0 rounded-lg border border-border/70 p-4 shadow-sm transition-colors hover:border-border">
                    <div className="grid gap-1">
                      <FormLabel className="text-base font-medium">
                        Show my profile to other members
                      </FormLabel>
                      <FormDescription>
                        When off, your profile is hidden from non-matches.
                      </FormDescription>
                      <FormMessage />
                    </div>
                    <FormControl>
                      <Switch
                        aria-label="Show my profile to other members"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="hideLastActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start justify-between gap-6 space-y-0 rounded-lg border border-border/70 p-4 shadow-sm transition-colors hover:border-border">
                    <div className="grid gap-1">
                      <FormLabel className="text-base font-medium">
                        Hide when I was last active
                      </FormLabel>
                      <FormDescription>
                        Stops showing your last-active timestamp on your profile.
                      </FormDescription>
                      <FormMessage />
                    </div>
                    <FormControl>
                      <Switch
                        aria-label="Hide when I was last active"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <Separator />

              <FormField
                control={form.control}
                name="hideReadReceipts"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start justify-between gap-6 space-y-0 rounded-lg border border-border/70 p-4 shadow-sm transition-colors hover:border-border">
                    <div className="grid gap-1">
                      <FormLabel className="text-base font-medium">Disable read receipts</FormLabel>
                      <FormDescription>
                        The people you message won’t see when you’ve read their note.
                      </FormDescription>
                      <FormMessage />
                    </div>
                    <FormControl>
                      <Switch
                        aria-label="Disable read receipts"
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {form.watch('profilePublic') ? (
                <Eye aria-hidden="true" className="size-3.5" />
              ) : (
                <EyeOff aria-hidden="true" className="size-3.5" />
              )}
              {form.formState.isDirty ? 'Unsaved changes' : 'All changes saved'}
            </p>
            <Button
              type="submit"
              disabled={submitting || !form.formState.isDirty}
              className="min-w-32"
            >
              {submitting ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
