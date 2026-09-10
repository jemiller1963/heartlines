// @polsia:user-owned — shared zod contract for the matching-feed profile
// resource. Imported by BOTH the route handler and the client page; a shape
// drift surfaces as a tsc / rwc ZodError at the parse boundary.
// Keep client-importable: zod only — no server-only imports.

import { z } from 'zod';

// Epic 5 questionnaire vocabulary. Keep these machine-readable values closed
// and versioned in the shared contract; labels belong to the future UX layer.
export const RelationshipIntent = z.enum([
  'companionship',
  'romance',
  'friendship',
  'long-term-partnership',
]);
export type RelationshipIntent = z.infer<typeof RelationshipIntent>;

export const DistancePreference = z.enum([
  'same-city',
  'nearby',
  'within-50-miles',
  'open-to-distance',
]);
export type DistancePreference = z.infer<typeof DistancePreference>;

export const LifestyleCharacteristic = z.enum([
  'active',
  'homebody',
  'social',
  'outdoors',
  'creative',
  'spiritual',
  'traveler',
  'pet-friendly',
]);
export type LifestyleCharacteristic = z.infer<typeof LifestyleCharacteristic>;

export const ValuePriority = z.enum([
  'family',
  'honesty',
  'kindness',
  'humor',
  'growth',
  'stability',
  'independence',
  'adventure',
]);
export type ValuePriority = z.infer<typeof ValuePriority>;

export const PartnerPreference = z.enum([
  'kindness',
  'communication',
  'humor',
  'emotional-availability',
  'shared-interests',
  'active-lifestyle',
  'family-oriented',
  'open-minded',
]);
export type PartnerPreference = z.infer<typeof PartnerPreference>;

const StructuredValues = <T extends z.ZodTypeAny>(value: T) =>
  z.array(value).max(8, 'Choose at most 8 values');

export const ProfileCreate = z.object({
  displayName: z.string().trim().max(80, 'Display name is too long').nullable().optional(),
  age: z
    .number()
    .int('Age must be a whole number')
    .min(50, 'Heart Lines is a 50+ community')
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
  // Legacy compatibility shape: free-form/self-described preference tags stay
  // representable and independent from the canonical closed taxonomy below.
  lifestylePreferences: z
    .array(z.string().min(1, 'Preference cannot be empty').max(40, 'Preference is too long'))
    .max(20, 'Too many lifestyle preferences')
    .optional(),
  relationshipIntent: RelationshipIntent.nullable().optional(),
  distancePreference: DistancePreference.nullable().optional(),
  // Canonical structured lifestyle meaning. Keep this closed and capped at
  // eight values; never auto-translate legacy lifestylePreferences strings.
  lifestyleCharacteristics: StructuredValues(LifestyleCharacteristic).optional(),
  valuesPriorities: StructuredValues(ValuePriority).optional(),
  partnerPreferences: StructuredValues(PartnerPreference).optional(),
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
  // This legacy field remains independent from lifestyleCharacteristics.
  lifestylePreferences: z.array(z.string().min(1).max(40)).max(20),
  relationshipIntent: RelationshipIntent.nullable().optional(),
  distancePreference: DistancePreference.nullable().optional(),
  // Optional on the response boundary so older feed/discover/avatar payloads
  // remain valid; the owner route normalizes missing DB defaults to `[]`.
  // It is the canonical structured field, not a translated view of the
  // legacy lifestylePreferences column.
  lifestyleCharacteristics: StructuredValues(LifestyleCharacteristic).optional(),
  valuesPriorities: StructuredValues(ValuePriority).optional(),
  partnerPreferences: StructuredValues(PartnerPreference).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProfileItem = z.infer<typeof ProfileItem>;
