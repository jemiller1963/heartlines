'use client';

// @polsia:user-owned — admin "Edit user" dialog.
//
// Submits PATCH /api/admin/users/[id] with the changed fields. Only the fields
// that differ from the row's current value are sent — submitting the whole form
// unchanged produces a no-op, and the server-side handler applies a "send only
// what changed" model so it can correctly disambiguate banned/role updates
// (PATCH branches on which fields appear in the body).
//
// React-hook-form is overkill for a 2-field partial update — a few `useState`s
// are clearer. The submit button stays disabled until at least one field
// differs from the baseline, which prevents accidental empty PATCH calls.

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/api-client';
import {
  AdminUserListItem,
  type AdminUserListItem as AdminUserListItemType,
  type AdminUserRole,
  type AdminUserUpdate,
} from '@/lib/contracts/admin-users';

interface Props {
  target: AdminUserListItemType | null;
  onOpenChange: (open: boolean) => void;
  onEdited: (item: AdminUserListItemType) => void;
}

export function EditUserDialog({ target, onOpenChange, onEdited }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminUserRole>('user');
  const [submitting, setSubmitting] = useState(false);

  // Reset every time a NEW target opens — keeps edits scoped to that row and
  // drops stale state from a prior row if the operator closes + opens again.
  useEffect(() => {
    if (target) {
      setName(target.name);
      setEmail(target.email);
      setRole(target.role);
      setSubmitting(false);
    }
  }, [target]);

  if (!target) return null;

  const isDirty =
    name.trim() !== target.name.trim() ||
    email.trim() !== target.email.trim() ||
    role !== target.role;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isDirty || submitting) return;
    setSubmitting(true);

    // Build a partial body — only include fields that actually changed.
    const patch: Partial<AdminUserUpdate> = {};
    if (name.trim() !== target.name.trim()) patch.name = name.trim();
    if (email.trim() !== target.email.trim()) patch.email = email.trim();
    if (role !== target.role) patch.role = role;

    try {
      const edited = await apiFetch(`/api/admin/users/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
        schema: AdminUserListItem,
      });
      toast.success('Saved');
      onEdited(edited);
    } catch (err) {
      const cause = (err as Error & { cause?: { error?: string } }).cause;
      toast.error(cause?.error ?? (err as Error).message);
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update {target.email}. Saving with no changes does nothing.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-user-name">Name</Label>
            <Input
              id="edit-user-name"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-user-email">Email</Label>
            <Input
              id="edit-user-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-user-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AdminUserRole)}>
              <SelectTrigger id="edit-user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isDirty || submitting}>
              {submitting ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
