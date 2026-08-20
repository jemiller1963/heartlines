'use client';

// @polsia:user-owned — admin "Create user" dialog.
//
// Submits POST /api/admin/users (which calls auth.api.createUser). Lives in
// its own file because it's a focused form — pulls in Input/Label/Button
// from the baseline UI set and is small enough to vendor directly here.
//
// Backed by react-hook-form + @hookform/resolvers/zod so the same AdminUserCreate
// schema validates both client-side (instant inline errors) and server-side
// (the handler re-parses at the wire boundary). The two sides can drift if
// someone edits one — but the ZodError they hit on first call will point at
// the field that drifted.

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
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
  AdminUserCreate,
  AdminUserListItem,
  type AdminUserListItem as AdminUserListItemType,
} from '@/lib/contracts/admin-users';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: AdminUserListItemType) => void;
}

export function CreateUserDialog({ open, onOpenChange, onCreated }: Props) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AdminUserCreate>({
    resolver: zodResolver(AdminUserCreate),
    defaultValues: { role: 'user', name: '', email: '', password: '' },
  });
  const roleValue = watch('role') ?? 'user';

  useEffect(() => {
    if (!open) {
      reset({ role: 'user', name: '', email: '', password: '' });
    }
  }, [open, reset]);

  const onSubmit = async (values: AdminUserCreate) => {
    try {
      const created = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(values),
        schema: AdminUserListItem,
      });
      toast.success(`Created ${created.name || created.email}`);
      onCreated(created);
    } catch (err) {
      const cause = (err as Error & { cause?: { error?: string } }).cause;
      toast.error(cause?.error ?? (err as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new account</DialogTitle>
          <DialogDescription>
            Add a Heart Lines member on their behalf. They'll sign in with the email and password
            you set here, and they can change them later.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-user-name">Name</Label>
            <Input
              id="create-user-name"
              autoComplete="name"
              aria-invalid={!!errors.name}
              {...register('name')}
            />
            {errors.name ? <p className="text-xs text-destructive">{errors.name.message}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-user-email">Email</Label>
            <Input
              id="create-user-email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-user-password">Initial password</Label>
            <Input
              id="create-user-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            ) : (
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="create-user-role">Role</Label>
            <Select
              value={roleValue}
              onValueChange={(v) =>
                setValue('role', v as AdminUserCreate['role'], { shouldValidate: true })
              }
            >
              <SelectTrigger id="create-user-role" aria-invalid={!!errors.role}>
                <SelectValue placeholder="Pick a role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">Member</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
            {errors.role ? <p className="text-xs text-destructive">{errors.role.message}</p> : null}
          </div>
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create user'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
