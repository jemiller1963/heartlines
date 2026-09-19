// @polsia:user-owned — client/server-safe upload constraints for Heart Lines images.

import { z } from 'zod';

export const IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_UPLOAD_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const EXTENSION_BY_CONTENT_TYPE: Record<(typeof IMAGE_UPLOAD_CONTENT_TYPES)[number], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const UploadTokenPayload = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('avatar'), userId: z.string().min(1) }),
  z.object({ kind: z.literal('verification-id'), userId: z.string().min(1) }),
]);
export type UploadTokenPayload = z.infer<typeof UploadTokenPayload>;

export function imageExtension(contentType: string): string | null {
  return (
    EXTENSION_BY_CONTENT_TYPE[contentType as (typeof IMAGE_UPLOAD_CONTENT_TYPES)[number]] ?? null
  );
}

export function isUploadPath(kind: UploadTokenPayload['kind'], pathname: string): boolean {
  const prefix = kind === 'avatar' ? 'avatars' : 'verification-ids';
  return new RegExp(`^${prefix}/[0-9a-f-]+\\.(?:jpg|png|webp)$`, 'i').test(pathname);
}
