'use client';

// @polsia:user-owned — admin delete-user confirmation dialog.
//
// Wraps a destructive `DELETE /api/admin/users/[id]` in a typed confirmation
// step so the operator doesn't accidentally remove a real account. The actual
// fetch happens in the parent list (UsersAdminList) on confirm — this dialog
// is pure UI: it surfaces the row's identity and asks for a second click.
//
// Self-row protection is enforced by the parent list (button is disabled) and
// re-enforced server-side at /api/admin/users/[id] (returns 400 with
// "You cannot delete yourself"). The parent already filters those operations,
// so this dialog only opens for valid targets.

import { useEffect, useState } from 'react';
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
import type { AdminUserListItem as AdminUserListItemType } from '@/lib/contracts/admin-users';

interface Props {
  target: AdminUserListItemType | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (target: AdminUserListItemType) => void;
}

export function ConfirmDeleteDialog({ target, onOpenChange, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (target) setConfirmText('');
  }, [target]);

  if (!target) return null;

  // Type-to-confirm gate — DELETE is irreversible (it removes the user + their
  // sessions + their accounts). Requiring the operator to type the email
  // before submit prevents fat-finger deletes, which is the right default on
  // a destructive action that has no undo.
  const matches = confirmText.trim() === target.email;

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete this account?</DialogTitle>
          <DialogDescription>
            Permanently remove <strong>{target.name || target.email}</strong> and all their
            sessions. Their profile, matches, and messages stay in the database but become
            unreachable. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="confirm-delete-input">
            Type <span className="font-mono text-foreground">{target.email}</span> to confirm
          </Label>
          <Input
            id="confirm-delete-input"
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
            placeholder={target.email}
          />
        </div>
        <DialogFooter className="mt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches}
            onClick={() => onConfirm(target)}
          >
            Delete user
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
