// @polsia:user-owned — Blocked members page.
//
// Server Component under (dashboard) — the layout already redirects
// unauthenticated visitors to /login, so the page itself makes no DB / fetch
// calls. Data is fetched by the <BlocksList /> island through GET /api/blocks
// to keep the data plane uniform.

import { BlocksList } from '@/components/custom/blocks/blocks-list';

export const metadata = {
  title: 'Blocked members',
  description: 'Review and unblock members you previously hid from your feed.',
};

export default function BlocksPage() {
  return (
    <div className="grid gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-muted-foreground">Settings</p>
        <h1 className="text-3xl font-semibold tracking-normal text-foreground">Blocked members</h1>
        <p className="text-sm text-muted-foreground">
          People you&apos;ve hidden from your feed. Unblocking restores them to your matches and
          messages.
        </p>
      </header>

      <BlocksList />
    </div>
  );
}
