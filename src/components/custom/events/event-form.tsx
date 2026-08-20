// @polsia:user-owned — Client form island for /events/new.
//
// Five fields (title, hostName, startTime, city, maxAttendees) submitted via
// react-hook-form + zodResolver against the shared `EventCreate` contract.
// On submit: POST → /api/events with the same schema parsed for the response
// (the `EventCreated` shape). On 201: toast.success + router.push('/events')
// + router.refresh() so the listing island (which fetches on mount) shows
// the newly-created row.
//
// Data plane: this island MUST NOT import server-only modules. biome
// `noRestrictedImports` HARD-FAILS the file if it imports `@/lib/db` /
// `@prisma/client` / `server-only` / `next/headers` / `@/lib/auth` /
// `@/lib/require-admin`.

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
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
import { apiFetch } from '@/lib/api-client';
import {
  type EventCreate,
  EventCreated,
  EventCreate as EventCreateSchema,
} from '@/lib/contracts/events';
import { applyServerErrors } from '@/lib/forms';

const DEFAULTS: EventCreate = {
  title: '',
  hostName: '',
  startTime: '',
  city: '',
  maxAttendees: 10,
};

export function EventForm() {
  const router = useRouter();

  const form = useForm<EventCreate>({
    resolver: zodResolver(EventCreateSchema),
    defaultValues: DEFAULTS,
  });

  const handleSubmit = useCallback(
    async (values: EventCreate) => {
      try {
        await apiFetch<EventCreated>('/api/events', {
          method: 'POST',
          body: JSON.stringify({
            ...values,
            // <Input type="datetime-local"> returns a local-time string with
            // no timezone — wrap it in `new Date()` so the wire payload is a
            // real ISO-8601 datetime zod can parse.
            startTime: new Date(values.startTime).toISOString(),
          }),
          schema: EventCreated,
        });
        toast.success('Event created');
        router.push('/events');
        router.refresh();
      } catch (err) {
        const cause = (err as Error & { cause?: unknown }).cause;
        const applied = applyServerErrors(cause, form.setError);
        if (!applied) {
          toast.error('Could not create the event');
        }
      }
    },
    [form, router],
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-eyebrow">Community</p>
        <h1 className="text-h2 font-bold text-foreground">Create an event</h1>
        <p className="text-body text-muted-foreground">
          Tell the community when and where you&apos;re gathering. The event will appear on /events
          for everyone to discover and RSVP.
        </p>
      </header>

      <Card className="border-border/70 bg-card shadow-sm">
        <CardHeader>
          <CardTitle className="text-h4">Event details</CardTitle>
          <CardDescription>All fields are required. You can update them later.</CardDescription>
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
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Sunday brunch book club"
                        maxLength={120}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="hostName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Host name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="How attendees should refer to you"
                        maxLength={80}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start time</FormLabel>
                    <FormControl>
                      <Input
                        type="datetime-local"
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormDescription>
                      Use your local time. Attendees will see it formatted for their timezone.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Paris"
                        autoComplete="address-level2"
                        maxLength={80}
                        value={field.value ?? ''}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="maxAttendees"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maximum attendees</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        value={
                          Number.isFinite(field.value ?? Number.NaN) ? String(field.value) : ''
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          field.onChange(v === '' ? Number.NaN : Number(v));
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      The cap on RSVPs. Leave at 10 for a small group, raise it for open events.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
                <Button asChild variant="outline">
                  <Link href="/events">Cancel</Link>
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting} size="lg">
                  {form.formState.isSubmitting ? (
                    <>
                      <Loader2 aria-hidden="true" className="animate-spin" />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Plus aria-hidden="true" />
                      Create event
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
