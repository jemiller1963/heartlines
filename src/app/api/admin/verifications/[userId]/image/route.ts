// @polsia:user-owned — admin-authorized streaming for private verification IDs.

import 'server-only';
import { BlobNotFoundError, get } from '@vercel/blob';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { BlobConfigurationError, getVerificationBlobToken } from '@/lib/business/blob-storage';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { userId } = await params;
  const submission = await prisma.idVerification.findUnique({
    where: { userId },
    select: { imagePath: true },
  });
  if (!submission) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const result = await get(submission.imagePath, {
      access: 'private',
      token: getVerificationBlobToken(),
      useCache: false,
    });
    if (!result || result.statusCode !== 200) {
      return new NextResponse('Not found', { status: 404 });
    }

    return new NextResponse(result.stream, {
      headers: {
        'Content-Type': result.blob.contentType,
        'Content-Disposition': 'inline',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof BlobNotFoundError) {
      return new NextResponse('Not found', { status: 404 });
    }
    const status = error instanceof BlobConfigurationError ? 503 : 502;
    // biome-ignore lint/suspicious/noConsole: retain a server-side private-read audit trail.
    console.error('Could not read private verification image.', error);
    return NextResponse.json({ error: 'Verification image unavailable' }, { status });
  }
}
