// @polsia:user-owned — seeded by polsia/modules/better-auth; restyle freely.
'use client';

import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth-client';
import { useMountedSession } from '@/lib/use-auth-session';

export function AuthNav() {
  const { data: session, isPending } = useMountedSession();

  // Render nothing until the session resolves — avoids a Sign-in→Profile flash.
  if (isPending) return null;

  if (!session?.user) {
    return (
      <nav className="flex items-center gap-2">
        <Button asChild variant="ghost">
          <a href="/login">Sign in</a>
        </Button>
        <Button asChild>
          <a href="/signup">Sign up</a>
        </Button>
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-2">
      <Button asChild variant="ghost">
        <a href="/profile">Profile</a>
      </Button>
      <Button
        variant="secondary"
        onClick={async () => {
          await signOut();
          window.location.assign('/');
        }}
      >
        Sign out
      </Button>
    </nav>
  );
}
