// @polsia:user-owned — owner-only private Blob identity-verification upload.

import 'server-only';
import { issueSignedToken } from '@vercel/blob';
import {
  type HandleUploadPresignedBody,
  handleUploadPresigned,
} from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import {
  BlobConfigurationError,
  deletePrivateBlobOrThrow,
  deleteReplacedBlob,
  getBlobWebhookPublicKey,
  getVerificationBlobToken,
  isPrivateVercelBlobUrl,
} from '@/lib/business/blob-storage';
import {
  IMAGE_UPLOAD_CONTENT_TYPES,
  IMAGE_UPLOAD_MAX_BYTES,
  isUploadPath,
  UploadTokenPayload,
} from '@/lib/contracts/uploads';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

const PRESIGNED_UPLOAD_TTL_MS = 10 * 60 * 1000;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as HandleUploadPresignedBody | null;
  if (!body?.type) {
    return NextResponse.json(
      { errors: { verificationId: 'Invalid upload request.' } },
      { status: 400 },
    );
  }

  let authorizedUserId: string | null = null;
  if (body.type === 'blob.generate-presigned-url') {
    const auth = await authOrResponse(req);
    if (!auth.ok) return auth.res;
    authorizedUserId = auth.session.id;

    const profile = await prisma.profile.findUnique({
      where: { userId: authorizedUserId },
      select: { id: true, verificationStatus: true },
    });
    if (!profile) {
      return NextResponse.json(
        { errors: { verificationId: 'Save your basics first.' } },
        { status: 404 },
      );
    }
    if (profile.verificationStatus === 'approved') {
      return NextResponse.json(
        { errors: { verificationId: 'Already verified.' } },
        { status: 409 },
      );
    }
    if (profile.verificationStatus === 'pending') {
      return NextResponse.json(
        { errors: { verificationId: 'Verification is already pending.' } },
        { status: 409 },
      );
    }
  }

  try {
    const token = getVerificationBlobToken();
    const response = await handleUploadPresigned({
      body,
      request: req,
      webhookPublicKey: getBlobWebhookPublicKey(),
      getSignedToken: async (pathname) => {
        if (!authorizedUserId || !isUploadPath('verification-id', pathname)) {
          throw new Error('Invalid verification upload path.');
        }

        const validUntil = Date.now() + PRESIGNED_UPLOAD_TTL_MS;
        return {
          token: await issueSignedToken({
            pathname,
            operations: ['put'],
            allowedContentTypes: [...IMAGE_UPLOAD_CONTENT_TYPES],
            maximumSizeInBytes: IMAGE_UPLOAD_MAX_BYTES,
            validUntil,
            token,
          }),
          urlOptions: {
            allowedContentTypes: [...IMAGE_UPLOAD_CONTENT_TYPES],
            maximumSizeInBytes: IMAGE_UPLOAD_MAX_BYTES,
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: false,
            tokenPayload: JSON.stringify({
              kind: 'verification-id',
              userId: authorizedUserId,
            }),
          },
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = UploadTokenPayload.parse(JSON.parse(tokenPayload ?? 'null'));
        if (
          payload.kind !== 'verification-id' ||
          !isUploadPath('verification-id', blob.pathname) ||
          !isPrivateVercelBlobUrl(blob.url)
        ) {
          throw new Error('Invalid verification completion payload.');
        }

        const [profile, previous] = await Promise.all([
          prisma.profile.findUnique({
            where: { userId: payload.userId },
            select: { verificationStatus: true },
          }),
          prisma.idVerification.findUnique({
            where: { userId: payload.userId },
            select: { imagePath: true, status: true },
          }),
        ]);

        if (
          !profile ||
          profile.verificationStatus === 'approved' ||
          (profile.verificationStatus === 'pending' &&
            previous?.imagePath &&
            previous.imagePath !== blob.url)
        ) {
          await deletePrivateBlobOrThrow(blob.url, token);
          return;
        }

        const submittedAt = new Date();
        await prisma.$transaction([
          prisma.idVerification.upsert({
            where: { userId: payload.userId },
            create: {
              userId: payload.userId,
              imagePath: blob.url,
              status: 'pending',
              submittedAt,
            },
            update: {
              imagePath: blob.url,
              status: 'pending',
              submittedAt,
              reviewedAt: null,
            },
          }),
          prisma.profile.update({
            where: { userId: payload.userId },
            data: { verificationStatus: 'pending' },
          }),
        ]);

        if (previous?.imagePath && previous.imagePath !== blob.url) {
          await deleteReplacedBlob(previous.imagePath, token);
        }
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const status = error instanceof BlobConfigurationError ? 503 : 400;
    const message =
      error instanceof BlobConfigurationError
        ? 'Verification storage is not configured.'
        : 'Could not process the verification upload.';
    // biome-ignore lint/suspicious/noConsole: retain a server-side upload failure audit trail.
    console.error(message, error);
    return NextResponse.json({ errors: { verificationId: message } }, { status });
  }
}
