// @polsia:user-owned — client-safe contract for the public profile surface.
// Keep this deliberately narrower than ProfileItem: matching-only, moderation,
// privacy, and derived access fields must never cross this boundary.

import { z } from 'zod';

export const ProfilePublicItem = z
  .object({
    id: z.string(),
    userId: z.string(),
    displayName: z.string().nullable(),
    age: z.number().int(),
    location: z.string(),
    interests: z.array(z.string()),
    lifestylePreferences: z.array(z.string()),
    bio: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    verificationStatus: z.enum(['unverified', 'pending', 'approved', 'rejected']).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type ProfilePublicItem = z.infer<typeof ProfilePublicItem>;

// Compatibility aliases retained for the profile client island and existing
// callers. All public profile responses use the same strict projection.
export const PublicProfile = ProfilePublicItem;
export type PublicProfile = ProfilePublicItem;

export const ProfilePublic = PublicProfile;
export type ProfilePublic = PublicProfile;
