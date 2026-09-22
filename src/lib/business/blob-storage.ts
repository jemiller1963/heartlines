// @polsia:user-owned — server-only Vercel Blob configuration and cleanup helpers.

import 'server-only';
import { BlobNotFoundError, del } from '@vercel/blob';

export class BlobConfigurationError extends Error {}

function requiredValue(
  name:
    | 'AVATAR_BLOB_READ_WRITE_TOKEN'
    | 'VERIFICATION_BLOB_READ_WRITE_TOKEN'
    | 'VERIFICATION_BLOB_WEBHOOK_PUBLIC_KEY',
) {
  const value = process.env[name];
  if (!value) {
    throw new BlobConfigurationError(`${name} is not configured.`);
  }
  return value;
}

export function getAvatarBlobToken() {
  return requiredValue('AVATAR_BLOB_READ_WRITE_TOKEN');
}

export function getVerificationBlobToken() {
  return requiredValue('VERIFICATION_BLOB_READ_WRITE_TOKEN');
}

export function getBlobWebhookPublicKey() {
  return requiredValue('VERIFICATION_BLOB_WEBHOOK_PUBLIC_KEY');
}

export function isVercelBlobUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith('.blob.vercel-storage.com');
  } catch {
    return false;
  }
}

export function isPrivateVercelBlobUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    return new URL(value).hostname.endsWith('.private.blob.vercel-storage.com');
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

export async function deletePrivateBlobOrThrow(url: string, token: string) {
  if (!isPrivateVercelBlobUrl(url)) {
    throw new Error('Refusing to delete a non-private verification Blob URL.');
  }
  try {
    await del(url, { token });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return;
    throw error;
  }
}
