// @polsia:user-owned — Profile photo picker + upload + remove.
//
// Combined UI block rendered above the text-form on both `/profile` and
// `/onboarding`. The browser uploads directly to the public avatar Blob store;
// /api/profile/avatar only authorizes the upload and handles the signed
// completion callback that persists its URL.

'use client';

import { upload as uploadBlob } from '@vercel/blob/client';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProfileItem } from '@/lib/contracts/profile';
import {
  IMAGE_UPLOAD_CONTENT_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
  imageExtension,
} from '@/lib/contracts/uploads';
import { cn } from '@/lib/utils';

const ACCEPT = IMAGE_UPLOAD_CONTENT_TYPES.join(',');
const ALLOWED_MIMES = new Set<string>(IMAGE_UPLOAD_CONTENT_TYPES);

interface ProfileAvatarProps {
  currentUrl: string | null | undefined;
  fallbackInitials?: string;
  /** Called after a successful upload OR delete so the parent can update its
   *  cached profile row (and the text-fields form's reset payload). */
  onUpdated: (item: ProfileItem) => void;
}

async function waitForPersistedAvatar(avatarUrl: string): Promise<ProfileItem | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch('/api/profile', { cache: 'no-store' });
    if (response.ok) {
      const profile = ProfileItem.parse(await response.json());
      if (profile.avatarUrl === avatarUrl) return profile;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
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

    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
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

    let uploadedUrl: string | null = null;
    try {
      const extension = imageExtension(file.type);
      if (!extension) throw new Error('Unsupported image type');
      const blob = await uploadBlob(`avatars/${crypto.randomUUID()}.${extension}`, file, {
        access: 'public',
        contentType: file.type,
        handleUploadUrl: '/api/profile/avatar',
      });
      uploadedUrl = blob.url;
      revokePreview();
      setDisplayUrl(blob.url);

      const updated = await waitForPersistedAvatar(blob.url).catch(() => null);
      if (updated) {
        onUpdated(updated);
        toast.success('Profile photo updated.');
      } else {
        toast.warning('Photo uploaded and is still being processed.');
      }
    } catch {
      revokePreview();
      // Once upload() returns, the signed callback can still finish even if
      // the follow-up profile refresh fails. Never visually roll that URL back.
      setDisplayUrl(uploadedUrl ?? currentUrl ?? null);
      const message = uploadedUrl
        ? 'Photo uploaded and is still being processed.'
        : 'Could not upload your photo.';
      setError(message);
      if (uploadedUrl) toast.warning(message);
      else toast.error(message);
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
