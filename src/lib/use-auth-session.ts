// @polsia:user-owned — SSR-safe session reader. better-auth's `useSession()`
// hook calls `React.useRef` during the Next.js server-side render pass of a
// 'use client' component, which throws "Cannot read properties of null
// (reading 'useRef')" because the React hooks module isn't fully wired.
// We sidestep the hook by calling the auth-client's `getSession` helper
// directly after mount. `isPending: true` until the request settles — callers
// treat it the same way they treat a normal loading state.

'use client';

import * as React from 'react';
import { authClient } from '@/lib/auth-client';

interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
}

export interface SessionState {
  data: { user: SessionUser } | null;
  isPending: boolean;
}

export function useMountedSession(): SessionState {
  const [state, setState] = React.useState<SessionState>({
    data: null,
    isPending: true,
  });
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    void authClient
      .getSession()
      .then((result: { data?: { user?: unknown } | null }) => {
        if (cancelled) return;
        const u = result.data?.user as Partial<SessionUser> | undefined;
        const user: SessionUser | null =
          u && typeof u.id === 'string'
            ? {
                id: u.id,
                email: typeof u.email === 'string' ? u.email : '',
                name: typeof u.name === 'string' ? u.name : '',
                role: typeof u.role === 'string' ? u.role : null,
              }
            : null;
        setState({ data: user ? { user } : null, isPending: false });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ data: null, isPending: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
