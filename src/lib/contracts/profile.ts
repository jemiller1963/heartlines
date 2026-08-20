// @polsia:user-owned — shared zod contract for the matching-feed profile
// resource. Imported by BOTH the route handler and the client page; a shape
// drift surfaces as a tsc / rwc ZodError at the parse boundary.
// Keep client-importable: zod only — no server-only imports.

import { z } from 'zod';

export const ProfileCreate = z.object({
  displayName: z.string().trim().max(80, 'Display name is too long').nullable().optional(),
  age: z
    .number()
    .int('Age must be a whole number')
    .min(18, 'You must be 18 or older')
    .max(120, 'Age is out of range'),
  location: z
    .string()
    .min(1, 'Tell us where you live')
    .max(120, 'That location is too long')
    .trim(),
  interests: z
    .array(z.string().min(1, 'Interest cannot be empty').max(40, 'Interest is too long'))
    .min(1, 'Add at least one interest')
    .max(20, 'Too many interests'),
  lifestylePreferences: z
    .array(z.string().min(1, 'Preference cannot be empty').max(40, 'Preference is too long'))
    .max(20, 'Too many lifestyle preferences')
    .optional(),
  bio: z.string().max(500, 'Bio is too long').trim().optional(),
});
export type ProfileCreate = z.infer<typeof ProfileCreate>;

export const ProfilePatch = ProfileCreate.partial();
export type ProfilePatch = z.infer<typeof ProfilePatch>;

export const ProfileItem = ProfileCreate.extend({
  id: z.string(),
  userId: z.string(),
  avatarUrl: z.string().nullable().optional(),
  // Server-set only (flipped by /api/profile/verification-id POST and the
  // future admin review slice). Nullable so any pre-deploy row still parses.
  verificationStatus: z
    .enum(['unverified', 'pending', 'approved', 'rejected'])
    .nullable()
    .optional(),
  // Always populated by the DB (column has @default([])). Override the
  // optional from ProfileCreate so callers can rely on it being a string[].
  lifestylePreferences: z.array(z.string().min(1).max(40)).max(20),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProfileItem = z.infer<typeof ProfileItem>;
