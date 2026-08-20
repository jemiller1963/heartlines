'use client';

// @polsia:user-owned — admin users management client island.
//
// State machine mirrors profile/verification review (loading / error / ready)
// so the admin toolbar feels like one tool. Mutations are optimistic where
// safe (role flip → swap the badge; ban flip → swap the status) and roll
// back via snapshot if apiFetch rejects. Create + Edit open a Dialog;
// Delete opens a Confirmation dialog inline.
//
// Self-row protection: every row whose id matches the signed-in admin's id
// has its edit / role / ban / delete controls disabled with an inline hint
// ("This is you") so an admin can't accidentally lock themselves out. The
// server-side gate at /api/admin/users/[id] mirrors these guards for any
// client that ignores them.
//
// Lint contract: no server-only imports — kept free of `@/lib/db`,
// `next/headers`, `@prisma/client`, `server-only`, and `@/lib/auth`. Pure
// consumer of /api/admin/users via apiFetch.

import {
  Ban,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  ShieldOff,
  Trash2,
  User as UserIcon,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiFetch } from '@/lib/api-client';
import {
  AdminUserList,
  AdminUserListItem,
  type AdminUserListItem as AdminUserListItemType,
} from '@/lib/contracts/admin-users';
import { useMountedSession } from '@/lib/use-auth-session';
import { ConfirmDeleteDialog } from './users-confirm-delete-dialog';
import { CreateUserDialog } from './users-create-dialog';
import { EditUserDialog } from './users-edit-dialog';

type State =
  | { status: 'loading' }
  | { status: 'ready'; items: AdminUserListItemType[] }
  | { status: 'error'; error: string };

export function UsersAdminList() {
  const router = useRouter();
  const { data: session, isPending: sessionIsPending } = useMountedSession();
  const selfId = session?.user?.id ?? null;

  const [state, setState] = useState<State>({ status: 'loading' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserListItemType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserListItemType | null>(null);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    apiFetch('/api/admin/users', { schema: AdminUserList })
      .then((res) => setState({ status: 'ready', items: res.items }))
      .catch((err: Error & { cause?: unknown }) => {
        const cause = err.cause as { error?: string } | null;
        setState({ status: 'error', error: cause?.error ?? err.message });
      });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Optimistic role flip: swap the badge first, undo on apiFetch reject.
  const setRole = useCallback(
    async (id: string, role: AdminUserListItemType['role']) => {
      if (state.status !== 'ready') return;
      if (id === selfId) {
        toast.error('You cannot change your own role');
        return;
      }
      const snapshot = state.items;
      setState({
        status: 'ready',
        items: snapshot.map((it) => (it.id === id ? { ...it, role } : it)),
      });
      setBusyId(id);
      try {
        await apiFetch(`/api/admin/users/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ role }),
          schema: AdminUserListItem,
        });
        toast.success(role === 'admin' ? 'Promoted to admin' : 'Demoted to member');
      } catch (err) {
        setState({ status: 'ready', items: snapshot });
        const cause = (err as Error & { cause?: { error?: string } }).cause;
        toast.error(cause?.error ?? (err as Error).message);
        // If the server says the row is gone, refetch so the table agrees.
        if (cause?.error === 'Not found') reload();
      } finally {
        setBusyId(null);
        router.refresh();
      }
    },
    [selfId, state, router, reload],
  );

  // Optimistic ban flip — same shape as role.
  const setBanned = useCallback(
    async (id: string, banned: boolean, banReason?: string) => {
      if (state.status !== 'ready') return;
      if (id === selfId) {
        toast.error('You cannot change your own ban state');
        return;
      }
      const snapshot = state.items;
      setState({
        status: 'ready',
        items: snapshot.map((it) => (it.id === id ? { ...it, banned } : it)),
      });
      setBusyId(id);
      try {
        await apiFetch(`/api/admin/users/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(
            banned ? { banned: true, ...(banReason ? { banReason } : {}) } : { banned: false },
          ),
          schema: AdminUserListItem,
        });
        toast.success(banned ? 'Banned' : 'Restored');
      } catch (err) {
        setState({ status: 'ready', items: snapshot });
        const cause = (err as Error & { cause?: { error?: string } }).cause;
        toast.error(cause?.error ?? (err as Error).message);
        if (cause?.error === 'Not found') reload();
      } finally {
        setBusyId(null);
        router.refresh();
      }
    },
    [selfId, state, router, reload],
  );

  const removeUser = useCallback(
    async (id: string) => {
      if (state.status !== 'ready') return;
      if (id === selfId) {
        toast.error('You cannot delete yourself');
        return;
      }
      const snapshot = state.items;
      // Optimistic remove — drop the row from the table immediately.
      setState({
        status: 'ready',
        items: snapshot.filter((it) => it.id !== id),
      });
      setBusyId(id);
      try {
        await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        toast.success('User removed');
      } catch (err) {
        setState({ status: 'ready', items: snapshot });
        const cause = (err as Error & { cause?: { error?: string } }).cause;
        toast.error(cause?.error ?? (err as Error).message);
      } finally {
        setBusyId(null);
        router.refresh();
      }
    },
    [selfId, state, router],
  );

  // Apply an edit returned from the Edit-dialog — patches the row in place.
  const applyEdited = useCallback(
    (edited: AdminUserListItemType) => {
      setState((prev) =>
        prev.status === 'ready'
          ? {
              status: 'ready',
              items: prev.items.map((it) => (it.id === edited.id ? edited : it)),
            }
          : prev,
      );
      router.refresh();
    },
    [router],
  );

  const applyCreated = useCallback(
    (created: AdminUserListItemType) => {
      setState((prev) =>
        prev.status === 'ready'
          ? { status: 'ready', items: [created, ...prev.items] }
          : { status: 'ready', items: [created] },
      );
      router.refresh();
    },
    [router],
  );

  const counts = useMemo(() => {
    if (state.status !== 'ready') return null;
    return {
      total: state.items.length,
      admins: state.items.filter((it) => it.role === 'admin').length,
      banned: state.items.filter((it) => it.banned).length,
    };
  }, [state]);

  if (state.status === 'loading' || sessionIsPending) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Loader2 aria-hidden="true" className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading users...</p>
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-base font-semibold text-destructive">Couldn't load users</p>
          <p className="text-sm text-muted-foreground">{state.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={reload}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <p className="text-small text-muted-foreground">
            {counts?.total ?? 0} users · {counts?.admins ?? 0} admins · {counts?.banned ?? 0} banned
          </p>
        </div>
        <Button type="button" onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" />
          New user
        </Button>
      </div>

      {state.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Users aria-hidden="true" className="size-6 text-muted-foreground" />
            <p className="text-base font-semibold text-foreground">No users yet</p>
            <p className="text-sm text-muted-foreground">
              Create the first account to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[1%] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.items.map((item) => (
                  <UserRow
                    key={item.id}
                    item={item}
                    isSelf={item.id === selfId}
                    disabled={!!busyId}
                    isBusiest={busyId === item.id}
                    onToggleRole={() => setRole(item.id, item.role === 'admin' ? 'user' : 'admin')}
                    onToggleBan={() => setBanned(item.id, !item.banned)}
                    onEdit={() => setEditTarget(item)}
                    onDelete={() => setDeleteTarget(item)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          setCreateOpen(false);
          applyCreated(created);
        }}
      />

      <EditUserDialog
        target={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onEdited={(edited) => {
          setEditTarget(null);
          applyEdited(edited);
        }}
      />

      <ConfirmDeleteDialog
        target={deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={(target) => {
          setDeleteTarget(null);
          void removeUser(target.id);
        }}
      />
    </div>
  );
}

interface RowProps {
  item: AdminUserListItemType;
  isSelf: boolean;
  disabled: boolean;
  isBusiest: boolean;
  onToggleRole: () => void;
  onToggleBan: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function UserRow({
  item,
  isSelf,
  disabled,
  isBusiest,
  onToggleRole,
  onToggleBan,
  onEdit,
  onDelete,
}: RowProps) {
  const fullName = item.name?.trim();
  return (
    <TableRow data-state={isBusiest ? 'selected' : undefined}>
      <TableCell className="align-middle">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-full border border-border/70 bg-muted/40">
            <UserIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium text-foreground">
              {fullName || 'Unnamed user'}
            </span>
            {isSelf ? <span className="text-xs text-muted-foreground">This is you</span> : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="align-middle">
        <span className="text-sm text-foreground">{item.email}</span>
      </TableCell>
      <TableCell className="align-middle">
        {item.role === 'admin' ? (
          <Badge variant="default">Admin</Badge>
        ) : (
          <Badge variant="secondary">Member</Badge>
        )}
      </TableCell>
      <TableCell className="align-middle">
        {item.banned ? (
          <Badge variant="destructive">Banned</Badge>
        ) : (
          <Badge variant="outline" className="border-brand-500/40 text-brand-600">
            Active
          </Badge>
        )}
      </TableCell>
      <TableCell className="align-middle text-sm text-muted-foreground">
        {new Date(item.createdAt).toLocaleString()}
      </TableCell>
      <TableCell className="align-middle">
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={disabled || isSelf}
            aria-busy={isBusiest}
            title={isSelf ? 'You cannot edit your own account here' : 'Edit user'}
          >
            <Pencil aria-hidden="true" />
            Edit
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onToggleBan}
            disabled={disabled || isSelf}
            aria-busy={isBusiest}
            title={
              isSelf
                ? 'You cannot change your own ban state'
                : item.banned
                  ? 'Restore access'
                  : 'Ban'
            }
          >
            {item.banned ? (
              <>
                <CheckCircle2 aria-hidden="true" />
                Restore
              </>
            ) : (
              <>
                <Ban aria-hidden="true" />
                Ban
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onToggleRole}
            disabled={disabled || isSelf}
            aria-busy={isBusiest}
            title={
              isSelf
                ? 'You cannot change your own role'
                : item.role === 'admin'
                  ? 'Demote to member'
                  : 'Promote to admin'
            }
          >
            {isBusiest ? (
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            ) : item.role === 'admin' ? (
              <>
                <ShieldOff aria-hidden="true" />
                Demote
              </>
            ) : (
              <>
                <ShieldOff aria-hidden="true" />
                Promote
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDelete}
            disabled={disabled || isSelf}
            aria-busy={isBusiest}
            title={isSelf ? 'You cannot delete yourself' : 'Delete user'}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 aria-hidden="true" />
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
