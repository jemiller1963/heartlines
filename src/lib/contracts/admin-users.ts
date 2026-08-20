// @polsia:user-owned — shared zod contract for the admin users-management slice.
//
// Imported by BOTH the admin route handler (`/api/admin/users`, `/api/admin/users/[id]`)
// AND the client island that powers the users page. Keeping it client-importable:
// zod only — no `server-only`, no `@/lib/db`, no `@prisma/client`. A drift between
// the two sides surfaces as a ZodError at the parse boundary.
//
// Wire shape rationale:
//   - `role` is a literal enum of the two roles better-auth's admin plugin knows
//     about (`adminRoles: ['admin']` plus the plugin default of 'user'). The
//     plugin stores role as a free-form string on User; we narrow it on the wire
//     so the UI doesn't have to render every odd string the DB might hold.
//   - `banned` is a plain boolean (the plugin's null/undefined both mean "not
//     banned"; we coalesce to false on the producer side).
//   - `createdAt` is an ISO datetime string so the client renders it with the
//     same `new Date(...).toLocaleString()` it uses for profiles/verifications.

import { z } from 'zod';

export const AdminUserRole = z.enum(['admin', 'user']);
export type AdminUserRole = z.infer<typeof AdminUserRole>;

export const AdminUserListItem = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: AdminUserRole,
  banned: z.boolean(),
  createdAt: z.string().datetime(),
});
export type AdminUserListItem = z.infer<typeof AdminUserListItem>;

export const AdminUserList = z.object({
  items: z.array(AdminUserListItem),
  total: z.number().int().nonnegative(),
});
export type AdminUserList = z.infer<typeof AdminUserList>;

// PATCH /api/admin/users/[id] body — every field is optional. The handler inspects
// which fields are present and dispatches to the matching admin-plugin method
// (setRole / banUser / unbanUser / updateUser). Sending `banned: true` AND `role`
// in the same call is unsupported — the handler resolves `banned` first (it has a
// session-revoke side-effect), then any remaining fields in a second pass.
export const AdminUserUpdate = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    role: AdminUserRole.optional(),
    banned: z.boolean().optional(),
    banReason: z.string().min(1).optional(),
  })
  .strict();
export type AdminUserUpdate = z.infer<typeof AdminUserUpdate>;

// POST /api/admin/users body — create a new user via auth.api.createUser.
// password is REQUIRED here (the admin sets it on behalf of the new user). name
// and email are also required role is optional — defaults to 'user' per the
// plugin's `defaultRole`.
export const AdminUserCreate = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: AdminUserRole.optional(),
});
export type AdminUserCreate = z.infer<typeof AdminUserCreate>;
