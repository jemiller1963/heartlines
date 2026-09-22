// @polsia:user-owned — member-facing private government-ID uploader.

'use client';

import { uploadPresigned } from '@vercel/blob/client';
import { Loader2, ShieldCheck, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProfileItem } from '@/lib/contracts/profile';
import {
  IMAGE_UPLOAD_CONTENT_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
  imageExtension,
} from '@/lib/contracts/uploads';

const ACCEPT = IMAGE_UPLOAD_CONTENT_TYPES.join(',');
const ALLOWED_MIMES = new Set<string>(IMAGE_UPLOAD_CONTENT_TYPES);

type VerificationState =
  | 'loading'
  | 'unverified'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'error';

async function readVerificationState(): Promise<Exclude<VerificationState, 'loading' | 'error'>> {
  const response = await fetch('/api/profile', { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not load verification status.');
  const profile = ProfileItem.parse(await response.json());
  return profile.verificationStatus ?? 'unverified';
}

async function waitForPending(): Promise<boolean> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if ((await readVerificationState()) === 'pending') return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

export function VerificationIdUploader() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [state, setState] = useState<VerificationState>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readVerificationState()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function upload(file: File) {
    setError(null);

    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      setError('ID image must be 5 MB or smaller.');
      return;
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      setError('ID image must be a JPEG, PNG, or WEBP image.');
      return;
    }

    const extension = imageExtension(file.type);
    if (!extension) {
      setError('Unsupported image type.');
      return;
    }

    setBusy(true);
    try {
      await uploadPresigned(`verification-ids/${crypto.randomUUID()}.${extension}`, file, {
        access: 'private',
        contentType: file.type,
        handleUploadUrl: '/api/profile/verification-id',
      });

      if (await waitForPending()) {
        setState('pending');
        toast.success('ID submitted for verification.');
      } else {
        const current = await readVerificationState().catch(() => null);
        if (current) setState(current);
        toast.warning('ID uploaded and is still being processed.');
      }
    } catch {
      setError('Could not submit your ID. Please try again.');
      toast.error('Could not submit your ID.');
    } finally {
      setBusy(false);
    }
  }

  const canUpload = state === 'unverified' || state === 'rejected';

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-5 text-brand-600" />
          <CardTitle className="text-h4">Identity verification</CardTitle>
        </div>
        <CardDescription>
          Submit a government-issued ID for private review. The image is not shown to other members
          and is deleted after an administrator records the decision.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state === 'loading' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading verification status…
          </p>
        ) : null}

        {state === 'pending' ? (
          <p className="text-sm text-muted-foreground">
            Your ID has been submitted and is waiting for administrator review.
          </p>
        ) : null}

        {state === 'approved' ? (
          <p className="text-sm font-medium text-foreground">Your identity is verified.</p>
        ) : null}

        {state === 'rejected' ? (
          <p className="text-sm text-muted-foreground">
            The previous submission was not accepted. You can submit a new ID image.
          </p>
        ) : null}

        {state === 'error' ? (
          <p role="alert" className="text-sm text-destructive">
            We couldn&apos;t load your verification status. Refresh the page to try again.
          </p>
        ) : null}

        <Input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void upload(file);
            event.currentTarget.value = '';
          }}
        />

        {canUpload ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Upload aria-hidden="true" />
              )}
              {busy ? 'Uploading…' : state === 'rejected' ? 'Submit new ID' : 'Submit ID'}
            </Button>
            <p className="text-small text-muted-foreground">JPEG, PNG, or WEBP. Up to 5 MB.</p>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
