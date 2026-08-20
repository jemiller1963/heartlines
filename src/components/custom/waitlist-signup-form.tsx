'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api-client';
import { WaitlistSignupCreate, WaitlistSignupItem } from '@/lib/contracts/waitlist';
import { applyServerErrors } from '@/lib/forms';

type WaitlistFormValues = WaitlistSignupCreate;

export function WaitlistSignupForm() {
  const form = useForm<WaitlistFormValues>({
    resolver: zodResolver(WaitlistSignupCreate),
    defaultValues: { email: '' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const created = await apiFetch('/api/waitlist', {
        method: 'POST',
        body: JSON.stringify(values),
        schema: WaitlistSignupItem,
      });
      form.reset({ email: '' });
      toast.success(`You're on the list — check ${created.email} for a confirmation email.`);
    } catch (err) {
      const applied = err instanceof Error && applyServerErrors(err.cause, form.setError);
      if (!applied) {
        toast.error('Something went wrong. Please try again.');
      }
    }
  });

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row sm:items-start"
        noValidate
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex-1 text-left">
              <FormLabel className="sr-only">Email address</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-label="Email address"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="lg"
          className="gap-2 sm:self-start"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting ? 'Joining…' : 'Join the waitlist'}
        </Button>
      </form>
    </Form>
  );
}
