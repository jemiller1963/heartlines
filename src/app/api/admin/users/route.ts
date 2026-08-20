// @polsia:user-owned — admin-only listing of all users, plus create-new.
//
// Goes through better-auth's admin plugin (`auth.api.listUsers` / `auth.api.createUser`)
// instead of touching `prisma.user` directly. `prisma.user.*` writes are still
// framework-owned and the ownership gate rejects edits to auth.prisma; even if
// writes were allowed, going through the plugin is the better-auth-idiomatic path:
//
//   - it runs the same input validation + hooks the public sign-up uses,
//   - it narrows the returned shape to "admin-safe" user fields (no Account
//     rows, no password hashes),
//   - it handles session/cookie side-effects the plugin needs.
//
// Self-role demotion protection is checked at the [id] route (the only place
// that can mutate role), not here — the plugin's middleware already blocks
// "you cannot ban/remove yourself" calls and we mirror the idea for setRole.
//
// Gates inline (auth.api.getSession + role === 'admin') — returns 401/403
// rather than redirecting, because a redirect turns a fetch into a 307 that
// the client island can't render. The page wrapper at
// src/app/(dashboard)/admin/users/page.tsx still uses `requireAdmin()` for
// the redirect-on-arrival path.

import 'server-only';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  AdminUserCreate,
  AdminUserList,
  AdminUserListItem,
  type AdminUserRole,
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

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  // Hard-cap the page so the table doesn't balloon on a large user list. 100 is
  // more than enough for admin review work; the table is a triage surface, not
  // a directory export.
  const limitRaw = url.searchParams.get('limit');
  const parsedLimit = Number.parseInt(limitRaw ?? '100', 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 100;

  let result: Awaited<ReturnType<typeof auth.api.listUsers>>;
  try {
    result = await auth.api.listUsers({
      headers: await headers(),
      query: {
        limit,
        sortBy: 'createdAt',
        sortDirection: 'desc',
      },
    });
  } catch {
    // Auth plugin failures (FORBIDDEN at the plugin middleware, etc). Fall
    // through to an empty list rather than a 500 — the page already gates.
    result = { users: [], total: 0 } as Awaited<typeof result>;
  }

  const items = result.users.map(toListItem);
  const body = AdminUserList.parse({
    items,
    total: typeof result.total === 'number' ? result.total : items.length,
  });
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parsed = AdminUserCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    // Collapse the zod tree into the first issue so the dialog can show it
    // inline without parsing the tree shape itself.
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? 'Invalid input' }, { status: 400 });
  }

  // auth.api.createUser respects the plugin's `defaultRole: 'user'` unless
  // `role` is supplied. We forward `role` only when explicitly set so a
  // newly-created user is a regular member by default.
  const { email, name, password, role } = parsed.data;
  try {
    const created = await auth.api.createUser({
      headers: await headers(),
      body: { email, name, password, ...(role ? { role } : {}) },
    });
    return NextResponse.json(toListItem(created.user), { status: 201 });
  } catch (err) {
    // The plugin throws for duplicate emails, weak passwords, and missing
    // permissions. Surface its message verbatim — it's already human-readable
    // (e.g. "User already exists").
    const message = err instanceof Error ? err.message : 'Could not create user';
    const status = /already exists|duple/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export const _internal = { toListItem, narrowRole };
