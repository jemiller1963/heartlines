// @polsia:user-owned — shared zod contract for the admin profile-review slice.
//
// Imported by BOTH the admin route handler (`GET /api/admin/profiles`) AND
// the future client island that powers the review-queue page. Keeping it
// client-importable: zod only — no `server-only`, no `@/lib/db`,
// no `@prisma/client`. A drift between the two sides surfaces as a ZodError
// at the parse boundary so the list and any future optimistic-update
// response stay in lockstep.
//
// Response field keys (`displayName`, `city`) are aliases of the underlying
// columns (`User.name`, `Profile.location`) — the DB shape stays as-is and
// the handler performs the rename before parsing. The contract is the wire
// contract.

import { z } from 'zod';

// Match the Prisma enum in prisma/schema/profile.prisma exactly — Prisma
// emits the UPPERCASE value strings on read, so the zod literal set must
// match. Keeping the uppercase set here also matches the conventional
// "moderation queue" vocabulary used in admin tooling.
export const ReviewStatus = z.enum(['PENDING', 'APPROVED', 'FLAGGED']);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const AdminProfileListItem = z.object({
  id: z.string(),
  displayName: z.string().nullable(),
  age: z.number().int(),
  city: z.string(),
  createdAt: z.string().datetime(),
  reviewStatus: ReviewStatus,
  avatarUrl: z.string().nullable(),
});
export type AdminProfileListItem = z.infer<typeof AdminProfileListItem>;

export const AdminProfileList = z.object({
  items: z.array(AdminProfileListItem),
});
export type AdminProfileList = z.infer<typeof AdminProfileList>;

// Decision body for PATCH /api/admin/profiles/[id]. The lowercase action
// strings match the buttons in the client island (no extra enum hop) and
// the route handler maps them onto the uppercase Prisma enum values.
export const AdminProfileDecision = z.object({
  action: z.enum(['approve', 'flag']),
});
export type AdminProfileDecision = z.infer<typeof AdminProfileDecision>;
