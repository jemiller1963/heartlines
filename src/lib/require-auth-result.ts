// @polsia:user-owned — helper that turns `requireAuth(req)` (which throws a
// 401 Response on failure) into a discriminated union, so route handlers can
// branch with a single `if (!auth.ok) return auth.res;` without wrestling with
// implicit-any `let`.
import 'server-only';
import { requireAuth, type SessionUser } from '@/lib/require-auth';

export type AuthResult =
  | { readonly ok: true; readonly session: SessionUser }
  | { readonly ok: false; readonly res: Response };

export async function authOrResponse(req: Request): Promise<AuthResult> {
  try {
    const session = await requireAuth(req);
    return { ok: true, session };
  } catch (res) {
    return { ok: false, res: res as Response };
  }
}
