// @polsia:user-owned — owner-only public Blob avatar upload/remove.

import 'server-only';
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import {
  BlobConfigurationError,
  deleteReplacedBlob,
  getAvatarBlobToken,
} from '@/lib/business/blob-storage';
import { ProfileItem } from '@/lib/contracts/profile';
import {
  IMAGE_UPLOAD_CONTENT_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
  isUploadPath,
  UploadTokenPayload,
} from '@/lib/contracts/uploads';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

function shape(row: {
  id: string;
  userId: string;
  displayName: string | null;
  age: number;
  location: string;
  interests: string[];
  lifestylePreferences: string[];
  bio: string | null;
  avatarUrl: string | null;
  verificationStatus: 'unverified' | 'pending' | 'approved' | 'rejected' | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return ProfileItem.parse({
    id: row.id,
    userId: row.userId,
    displayName: row.displayName ?? null,
    age: row.age,
    location: row.location,
    interests: row.interests,
    lifestylePreferences: row.lifestylePreferences,
    bio: row.bio ?? undefined,
    avatarUrl: row.avatarUrl ?? null,
    verificationStatus: row.verificationStatus ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body?.type) {
    return NextResponse.json({ errors: { avatar: 'Invalid upload request.' } }, { status: 400 });
  }

  let authorizedUserId: string | null = null;
  if (body.type === 'blob.generate-client-token') {
    const auth = await authOrResponse(req);
    if (!auth.ok) return auth.res;
    authorizedUserId = auth.session.id;

    const profile = await prisma.profile.findUnique({
      where: { userId: authorizedUserId },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json({ errors: { avatar: 'Save your basics first.' } }, { status: 404 });
    }
  }

  try {
    const token = getAvatarBlobToken();
    const response = await handleUpload({
      body,
      request: req,
      token,
      onBeforeGenerateToken: async (pathname) => {
        if (!authorizedUserId || !isUploadPath('avatar', pathname)) {
          throw new Error('Invalid avatar upload path.');
        }
        return {
          allowedContentTypes: [...IMAGE_UPLOAD_CONTENT_TYPES],
          maximumSizeInBytes: IMAGE_UPLOAD_MAX_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ kind: 'avatar', userId: authorizedUserId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = UploadTokenPayload.parse(JSON.parse(tokenPayload ?? 'null'));
        if (payload.kind !== 'avatar' || !isUploadPath('avatar', blob.pathname)) {
          throw new Error('Invalid avatar completion payload.');
        }

        const existing = await prisma.profile.findUnique({
          where: { userId: payload.userId },
          select: { avatarUrl: true },
        });
        if (!existing) {
          await deleteReplacedBlob(blob.url, token);
          return;
        }

        await prisma.profile.update({
          where: { userId: payload.userId },
          data: { avatarUrl: blob.url },
        });
        await deleteReplacedBlob(existing.avatarUrl, token);
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const status = error instanceof BlobConfigurationError ? 503 : 400;
    const message =
      error instanceof BlobConfigurationError
        ? 'Avatar storage is not configured.'
        : 'Could not process the avatar upload.';
    // biome-ignore lint/suspicious/noConsole: retain a server-side upload failure audit trail.
    console.error(message, error);
    return NextResponse.json({ errors: { avatar: message } }, { status });
  }
}

export async function DELETE(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const existing = await prisma.profile.findUnique({ where: { userId: auth.session.id } });
  if (!existing) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const token = getAvatarBlobToken();
    const updated = await prisma.profile.update({
      where: { userId: auth.session.id },
      data: { avatarUrl: null },
    });
    await deleteReplacedBlob(existing.avatarUrl, token);
    return NextResponse.json(shape(updated));
  } catch (error) {
    const status = error instanceof BlobConfigurationError ? 503 : 500;
    const message =
      error instanceof BlobConfigurationError
        ? 'Avatar storage is not configured.'
        : 'Could not remove your photo.';
    // biome-ignore lint/suspicious/noConsole: retain a server-side deletion failure audit trail.
    console.error(message, error);
    return NextResponse.json({ errors: { avatar: message } }, { status });
  }
}
