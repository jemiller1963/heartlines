// @polsia:user-owned — shared zod contract for POST /api/waitlist.
// Keep contract modules client-importable: zod only, no server-only imports.
import { z } from 'zod';

// Write shape: the email a visitor submits on the landing page form.
export const WaitlistSignupCreate = z.object({
  email: z.string().email('Please enter a valid email address').max(254, 'Email is too long'),
});

export type WaitlistSignupCreate = z.infer<typeof WaitlistSignupCreate>;

// Read shape: the persisted row the route hands back so the client can clear
// the form. Mirrors the `WaitlistSignup` model (id + email + createdAt ISO).
export const WaitlistSignupItem = z.object({
  id: z.string(),
  email: z.string(),
  createdAt: z.string(),
});

export type WaitlistSignupItem = z.infer<typeof WaitlistSignupItem>;
