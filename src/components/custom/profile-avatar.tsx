// @polsia:user-owned — Profile photo picker + upload + remove.
//
// Combined UI block rendered above the text-form on both `/profile` and
// `/onboarding`. POSTs multipart/form-data directly to /api/profile/avatar
// (NOT through `apiFetch`, which forces JSON content-type). Server errors of
// the shape `{ errors: { avatar: '...' } }` are surfaced inline below the
// input; success swaps the local preview for the canonical URL emitted by
// the server.

'use client';

import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProfileItem } from '@/lib/contracts/profile';
import { cn } from '@/lib/utils';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface ProfileAvatarProps {
  currentUrl: string | null | undefined;
  fallbackInitials?: string;
  /** Called after a successful upload OR delete so the parent can update its
   *  cached profile row (and the text-fields form's reset payload). */
  onUpdated: (item: ProfileItem) => void;
}

interface ErrorBody {
  errors?: { avatar?: string };
}

export function ProfileAvatar({
  currentUrl,
  fallbackInitials = '',
  onUpdated,
}: ProfileAvatarProps) {
  const previewRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Local-only view (object URL) until server confirms; canonical URL
  // afterwards. We render `displayUrl ?? undefined` so <AvatarImage> cleanly
  // falls back when nothing is set.
  const [displayUrl, setDisplayUrl] = useState<string | null>(currentUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function revokePreview() {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
  }

  async function upload(file: File) {
    setError(null);

    if (file.size > MAX_BYTES) {
      setError('Photo must be 5 MB or smaller.');
      return;
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      setError('Photo must be a JPEG, PNG, or WEBP image.');
      return;
    }

    revokePreview();
    const blobUrl = URL.createObjectURL(file);
    previewRef.current = blobUrl;
    setDisplayUrl(blobUrl);
    setBusy(true);

    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/profile/avatar', { method: 'POST', body: fd });
      const body: ErrorBody | ProfileItem | null = await res.json().catch(() => null);
      if (!res.ok) {
        revokePreview();
        setDisplayUrl(currentUrl ?? null);
        const msg =
          body && 'errors' in body && body.errors?.avatar
            ? body.errors.avatar
            : 'Could not upload your photo.';
        setError(msg);
        toast.error(msg);
        return;
      }
      const updated = ProfileItem.parse(body);
      revokePreview();
      setDisplayUrl(updated.avatarUrl ?? null);
      onUpdated(updated);
      toast.success('Profile photo updated.');
    } catch {
      revokePreview();
      setDisplayUrl(currentUrl ?? null);
      setError('Could not upload your photo.');
      toast.error('Could not upload your photo.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      if (!res.ok) {
        toast.error('Could not remove your photo.');
        return;
      }
      const updated = ProfileItem.parse(await res.json());
      setDisplayUrl(null);
      onUpdated(updated);
      if (inputRef.current) inputRef.current.value = '';
      toast.success('Photo removed.');
    } catch {
      toast.error('Could not remove your photo.');
    } finally {
      setBusy(false);
    }
  }

  const hasPhoto = Boolean(displayUrl);
  const initials = fallbackInitials.trim().slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-5">
        <Avatar className="size-20 border border-border/70 shadow-sm">
          {hasPhoto ? <AvatarImage src={displayUrl ?? undefined} alt="Profile photo" /> : null}
          <AvatarFallback className="text-h4 font-semibold bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
            {initials || <Camera className="size-7" aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-1 flex-col gap-2">
          <Input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void upload(file);
              // Allow re-selecting the same file later.
              e.currentTarget.value = '';
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={hasPhoto ? 'outline' : 'default'}
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Camera aria-hidden="true" />
              )}
              {hasPhoto ? 'Change photo' : 'Add photo'}
            </Button>
            {hasPhoto ? (
              <Button type="button" variant="ghost" disabled={busy} onClick={remove}>
                <Trash2 aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>
          <p className={cn('text-small text-muted-foreground')}>JPEG, PNG, or WEBP. Up to 5 MB.</p>
          {error ? (
            <p
              role="alert"
              className="text-caption font-medium text-destructive-foreground bg-destructive/15 border border-destructive/30 rounded-md px-3 py-2"
            >
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
