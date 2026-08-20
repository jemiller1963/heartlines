// @polsia:user-owned — admin-only update / ban / unban / delete for one user.
//
// Goes through better-auth's admin plugin (`auth.api.setRole`, `auth.api.adminUpdateUser`,
// `auth.api.banUser`, `auth.api.unbanUser`, `auth.api.removeUser`) and never
// touches `prisma.user` directly: the `user` model lives in locked `auth.prisma`
// and the ownership gate rejects writes that bypass the plugin (CAS-cade deletes
// to Session/Account, plugin permission checks, plugin events). Better-auth also
// enforces "you cannot ban yourself" / "you cannot remove yourself" server-side;
// we mirror that for the demotion path (setRole) so an admin can never lock
// themselves out by switching their own row to role='user'.
//
// PATCH shape: every field in AdminUserUpdate is optional. The handler picks
// which plugin method(s) to call from the fields that are present:
//   - banned:true  → auth.api.banUser
//   - banned:false → auth.api.unbanUser
//   - role present → auth.api.setRole
//   - name/email   → fold into auth.api.adminUpdateUser (the admin plugin's
//                    write endpoint; `auth.api.updateUser` is the *self*-update
//                    surface and does not take a userId).
//
// DELETE is the only "remove" verb; the plugin method is `removeUser`.
//
// Gates inline (auth.api.getSession + role === 'admin') — returns 401/403
// rather than redirecting so a stray fetch doesn't 307 into something the
// client island can't render.

import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  AdminUserListItem,
  type AdminUserRole,
  AdminUserUpdate,
} from '@/lib/contracts/admin-users';

export const dynamic = 'force-dynamic';

function narrowRole(raw: unknown): AdminUserRole {
  return raw === 'admin' ? 'admin' : 'user';
}

function toListItem(u: {
  id: string;
  name: string;
  email: string;
  role?: string | null;
  banned: boolean | null | undefined;
  createdAt: string | Date;
}): AdminUserListItem {
  return AdminUserListItem.parse({
    id: u.id,
    name: u.name,
    email: u.email,
    role: narrowRole(u.role),
    banned: Boolean(u.banned),
    createdAt: typeof u.createdAt === 'string' ? u.createdAt : u.createdAt.toISOString(),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const parsed = AdminUserUpdate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? 'Invalid input' }, { status: 400 });
  }

  // Self-role demotion guard: better-auth's plugin blocks ban/remove on self,
  // but NOT a self-demotion (setRole({ userId: self, role: 'user' })) — and a
  // self-demote would silently lock this admin out for the rest of the session
  // page. We refuse up front and let better-auth's middleware error surface
  // for every other forbidden case below.
  if (parsed.data.role !== undefined && id === session.user.id && parsed.data.role !== 'admin') {
    return NextResponse.json({ error: 'You cannot demote yourself' }, { status: 400 });
  }

  const headersNow = await headers();

  // 1. Ban change (if present) — performed FIRST because ban has a
  //    session-revoke side-effect, and we want it to land before any
  //    subsequent name/email edits so the operator's other edits write
  //    onto already-banned (or already-unbanned) rows.
  if (parsed.data.banned !== undefined) {
    try {
      if (parsed.data.banned) {
        await auth.api.banUser({
          headers: headersNow,
          body: {
            userId: id,
            ...(parsed.data.banReason ? { banReason: parsed.data.banReason } : {}),
          },
        });
      } else {
        await auth.api.unbanUser({
          headers: headersNow,
          body: { userId: id },
        });
      }
    } catch (err) {
      // The plugin throws for self-ban / not-found / permission failure.
      const message = err instanceof Error ? err.message : 'Could not change ban state';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // 2. Role change (if present) — ban does NOT mutate role, so the two
  //    orthogonally compose. The self-demotion guard above already refused
  //    the dangerous case before we got here.
  if (parsed.data.role !== undefined) {
    try {
      await auth.api.setRole({
        headers: headersNow,
        body: { userId: id, role: parsed.data.role },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not change role';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  // 3. name/email change — fold into a single adminUpdateUser call. The admin
  //    plugin's update endpoint is exposed as `adminUpdateUser` (not `updateUser`,
  //    which is the *self*-update surface and expects no userId).
  const profilePatch: { name?: string; email?: string } = {};
  if (parsed.data.name !== undefined) profilePatch.name = parsed.data.name;
  if (parsed.data.email !== undefined) profilePatch.email = parsed.data.email;
  if (Object.keys(profilePatch).length > 0) {
    try {
      await auth.api.adminUpdateUser({
        headers: headersNow,
        body: { userId: id, data: profilePatch },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update user';
      const status = /already exists|in use/i.test(message) ? 409 : 400;
      return NextResponse.json({ error: message }, { status });
    }
  }

  // 4. Re-read via listUsers with a strict match on the id so we return the
  //    freshly persisted row shape rather than operator-merged guess. We can't
  //    call `getUser` directly without the better-auth admin `get-user` endpoint
  //    (not in the admin plugin's set as shipped), so a tight listUsers filter
  //    with `limit=1` is the closest admin-safe read.
  let refreshed: Awaited<ReturnType<typeof auth.api.listUsers>> | null = null;
  try {
    refreshed = await auth.api.listUsers({
      headers: headersNow,
      query: { limit: 1, filterField: 'id', filterOperator: 'eq', filterValue: id },
    });
  } catch {
    refreshed = null;
  }
  const found = refreshed?.users?.[0];
  if (!found) {
    // The row may have been deleted by another operator between our writes.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json(toListItem(found), { status: 200 });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  // Self-delete guard: the plugin already refuses (`YOU_CANNOT_REMOVE_YOURSELF`),
  // but we mirror it at the wire so the UX doesn't show a plugin error string.
  if (id === session.user.id) {
    return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 400 });
  }

  try {
    await auth.api.removeUser({ headers: await headers(), body: { userId: id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not delete user';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
