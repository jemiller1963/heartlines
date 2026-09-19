// @polsia:user-owned — server-only Vercel Blob configuration and cleanup helpers.

import 'server-only';
import { del } from '@vercel/blob';

export class BlobConfigurationError extends Error {}

function requiredToken(
  name: 'AVATAR_BLOB_READ_WRITE_TOKEN' | 'VERIFICATION_BLOB_READ_WRITE_TOKEN',
) {
  const token = process.env[name];
  if (!token) {
    throw new BlobConfigurationError(`${name} is not configured.`);
  }
  return token;
}

export function getAvatarBlobToken() {
  return requiredToken('AVATAR_BLOB_READ_WRITE_TOKEN');
}

export function getVerificationBlobToken() {
  return requiredToken('VERIFICATION_BLOB_READ_WRITE_TOKEN');
}

export function isVercelBlobUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export async function deleteReplacedBlob(url: string | null | undefined, token: string) {
  if (!isVercelBlobUrl(url)) return;
  try {
    await del(url, { token });
  } catch (error) {
    // Persistence already points at the replacement. Cleanup is best-effort so
    // a transient Blob outage cannot roll the user back to an older image.
    // biome-ignore lint/suspicious/noConsole: retain a server-side cleanup audit trail.
    console.error('Could not delete replaced Blob object.', error);
  }
}
