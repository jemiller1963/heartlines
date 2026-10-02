// @vitest-environment node
// @polsia:user-owned — Phase 2 storage authorization, persistence, and private-read tests.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));

const mocks = vi.hoisted(() => {
  const authOrResponse = vi.fn();
  const getSession = vi.fn();
  const del = vi.fn();
  const get = vi.fn();
  const issueSignedToken = vi.fn();
  const handleUpload = vi.fn();
  const handleUploadPresigned = vi.fn();
  const generatedConstraints = { current: null as null | Record<string, unknown> };
  const generatedPresigned = { current: null as null | Record<string, unknown> };
  const prisma = {
    profile: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    idVerification: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    user: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  };
  return {
    authOrResponse,
    getSession,
    del,
    get,
    issueSignedToken,
    handleUpload,
    handleUploadPresigned,
    generatedConstraints,
    generatedPresigned,
    prisma,
  };
});

vi.mock('@vercel/blob', () => {
  class BlobNotFoundError extends Error {}
  return {
    BlobNotFoundError,
    del: mocks.del,
    get: mocks.get,
    issueSignedToken: mocks.issueSignedToken,
  };
});
vi.mock('@vercel/blob/client', () => ({
  handleUpload: mocks.handleUpload,
  handleUploadPresigned: mocks.handleUploadPresigned,
}));
vi.mock('@/lib/require-auth-result', () => ({ authOrResponse: mocks.authOrResponse }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: mocks.getSession } } }));
vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));

const USER_ID = 'member-1';
const AVATAR_PATH = 'avatars/11111111-1111-4111-8111-111111111111.jpg';
const AVATAR_URL = 'https://avatar-store.public.blob.vercel-storage.com/new-avatar.jpg';
const PRIVATE_PATH = 'verification-ids/22222222-2222-4222-8222-222222222222.png';
const PRIVATE_URL = 'https://id-store.private.blob.vercel-storage.com/new-id.png';

function request(body: unknown, pathname = '/api/profile/avatar') {
  return new Request(`http://test${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function tokenEvent(pathname: string) {
  return {
    type: 'blob.generate-client-token',
    payload: { pathname, clientPayload: null, multipart: false },
  } as const;
}

function presignedEvent(pathname: string) {
  return {
    type: 'blob.generate-presigned-url',
    payload: { pathname, clientPayload: null, multipart: false },
  } as const;
}

function completionEvent(blob: { pathname: string; url: string }, tokenPayload: unknown) {
  return {
    type: 'blob.upload-completed',
    payload: { blob, tokenPayload: JSON.stringify(tokenPayload) },
  } as const;
}

beforeEach(() => {
  vi.resetAllMocks();
  process.env.AVATAR_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_avatar';
  process.env.VERIFICATION_BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_verification';
  process.env.VERIFICATION_BLOB_WEBHOOK_PUBLIC_KEY = 'test-webhook-public-key';
  mocks.generatedConstraints.current = null;
  mocks.generatedPresigned.current = null;
  mocks.issueSignedToken.mockResolvedValue({
    delegationToken: 'delegation-token',
    clientSigningToken: 'client-signing-token',
    validUntil: Date.now() + 600_000,
  });
  mocks.prisma.$transaction.mockImplementation(async (operations: unknown[]) =>
    Promise.all(operations),
  );
  mocks.handleUpload.mockImplementation(
    async (options: {
      body: ReturnType<typeof tokenEvent> | ReturnType<typeof completionEvent>;
      onBeforeGenerateToken: (pathname: string) => Promise<Record<string, unknown>>;
      onUploadCompleted?: (payload: ReturnType<typeof completionEvent>['payload']) => Promise<void>;
    }) => {
      if (options.body.type === 'blob.generate-client-token') {
        mocks.generatedConstraints.current = await options.onBeforeGenerateToken(
          options.body.payload.pathname,
        );
        return { type: 'blob.generate-client-token', clientToken: 'client-token' };
      }
      await options.onUploadCompleted?.(options.body.payload);
      return { type: 'blob.upload-completed', response: 'ok' };
    },
  );
  mocks.handleUploadPresigned.mockImplementation(
    async (options: {
      body: ReturnType<typeof presignedEvent> | ReturnType<typeof completionEvent>;
      getSignedToken: (
        pathname: string,
        clientPayload: string | null,
        multipart: boolean,
      ) => Promise<Record<string, unknown>>;
      onUploadCompleted?: (payload: ReturnType<typeof completionEvent>['payload']) => Promise<void>;
    }) => {
      if (options.body.type === 'blob.generate-presigned-url') {
        mocks.generatedPresigned.current = await options.getSignedToken(
          options.body.payload.pathname,
          options.body.payload.clientPayload,
          options.body.payload.multipart,
        );
        return {
          type: 'blob.generate-presigned-url',
          presignedUrlPayload: {
            delegationToken: 'delegation-token',
            signature: 'signature',
            params: {},
          },
        };
      }
      await options.onUploadCompleted?.(options.body.payload);
      return { type: 'blob.upload-completed', response: 'ok' };
    },
  );
});

describe('avatar Blob upload route', () => {
  it('requires authentication before issuing a client token', async () => {
    mocks.authOrResponse.mockResolvedValue({
      ok: false,
      res: new Response(null, { status: 401 }),
    });
    const { POST } = await import('@/app/api/profile/avatar/route');

    const response = await POST(request(tokenEvent(AVATAR_PATH)));

    expect(response.status).toBe(401);
    expect(mocks.handleUpload).not.toHaveBeenCalled();
    expect(mocks.prisma.profile.findUnique).not.toHaveBeenCalled();
  });

  it('issues a user-bound token constrained to image MIME types and 5 MB', async () => {
    mocks.authOrResponse.mockResolvedValue({ ok: true, session: { id: USER_ID } });
    mocks.prisma.profile.findUnique.mockResolvedValue({ id: 'profile-1' });
    const { POST } = await import('@/app/api/profile/avatar/route');

    const response = await POST(request(tokenEvent(AVATAR_PATH)));

    expect(response.status).toBe(200);
    expect(mocks.generatedConstraints.current).toMatchObject({
      allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maximumSizeInBytes: 5 * 1024 * 1024,
      addRandomSuffix: false,
    });
    expect(JSON.parse(String(mocks.generatedConstraints.current?.tokenPayload))).toEqual({
      kind: 'avatar',
      userId: USER_ID,
    });
  });

  it('persists the completed public URL and removes the replaced Blob', async () => {
    const oldUrl = 'https://avatar-store.public.blob.vercel-storage.com/old-avatar.jpg';
    mocks.prisma.profile.findUnique.mockResolvedValue({ avatarUrl: oldUrl });
    mocks.prisma.profile.update.mockResolvedValue({});
    const { POST } = await import('@/app/api/profile/avatar/route');

    const response = await POST(
      request(
        completionEvent(
          { pathname: AVATAR_PATH, url: AVATAR_URL },
          { kind: 'avatar', userId: USER_ID },
        ),
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { avatarUrl: AVATAR_URL },
    });
    expect(mocks.del).toHaveBeenCalledWith(oldUrl, { token: 'vercel_blob_rw_avatar' });
  });

  it('clears the database URL before deleting an existing avatar Blob', async () => {
    const oldUrl = 'https://avatar-store.public.blob.vercel-storage.com/old-avatar.jpg';
    const existing = {
      id: 'profile-1',
      userId: USER_ID,
      displayName: 'Member',
      age: 62,
      location: 'Pennsylvania',
      interests: ['walking'],
      lifestylePreferences: [],
      bio: null,
      avatarUrl: oldUrl,
      verificationStatus: 'unverified',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    mocks.authOrResponse.mockResolvedValue({ ok: true, session: { id: USER_ID } });
    mocks.prisma.profile.findUnique.mockResolvedValue(existing);
    mocks.prisma.profile.update.mockResolvedValue({ ...existing, avatarUrl: null });
    const { DELETE } = await import('@/app/api/profile/avatar/route');

    const response = await DELETE(
      new Request('http://test/api/profile/avatar', { method: 'DELETE' }),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { avatarUrl: null },
    });
    expect(mocks.prisma.profile.update.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.del.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});

describe('verification-ID presigned private upload route', () => {
  it('requires authentication before issuing a presigned URL', async () => {
    mocks.authOrResponse.mockResolvedValue({
      ok: false,
      res: new Response(null, { status: 401 }),
    });
    const { POST } = await import('@/app/api/profile/verification-id/route');

    const response = await POST(
      request(presignedEvent(PRIVATE_PATH), '/api/profile/verification-id'),
    );

    expect(response.status).toBe(401);
    expect(mocks.handleUploadPresigned).not.toHaveBeenCalled();
    expect(mocks.issueSignedToken).not.toHaveBeenCalled();
  });

  it('issues an exact-path PUT delegation constrained to approved image types and 5 MB', async () => {
    mocks.authOrResponse.mockResolvedValue({ ok: true, session: { id: USER_ID } });
    mocks.prisma.profile.findUnique.mockResolvedValue({
      id: 'profile-1',
      verificationStatus: 'unverified',
    });
    const { POST } = await import('@/app/api/profile/verification-id/route');

    const response = await POST(
      request(presignedEvent(PRIVATE_PATH), '/api/profile/verification-id'),
    );

    expect(response.status).toBe(200);
    expect(mocks.issueSignedToken).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: PRIVATE_PATH,
        operations: ['put'],
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maximumSizeInBytes: 5 * 1024 * 1024,
        token: 'vercel_blob_rw_verification',
      }),
    );
    const presigned = mocks.generatedPresigned.current as {
      urlOptions?: Record<string, unknown>;
    } | null;
    expect(presigned?.urlOptions).toMatchObject({
      allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maximumSizeInBytes: 5 * 1024 * 1024,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    expect(JSON.parse(String(presigned?.urlOptions?.tokenPayload))).toEqual({
      kind: 'verification-id',
      userId: USER_ID,
    });
  });

  it('does not issue a new upload URL while verification is pending or approved', async () => {
    mocks.authOrResponse.mockResolvedValue({ ok: true, session: { id: USER_ID } });
    const { POST } = await import('@/app/api/profile/verification-id/route');

    for (const verificationStatus of ['pending', 'approved'] as const) {
      mocks.prisma.profile.findUnique.mockResolvedValueOnce({
        id: 'profile-1',
        verificationStatus,
      });
      const response = await POST(
        request(presignedEvent(PRIVATE_PATH), '/api/profile/verification-id'),
      );
      expect(response.status).toBe(409);
    }

    expect(mocks.handleUploadPresigned).not.toHaveBeenCalled();
    expect(mocks.issueSignedToken).not.toHaveBeenCalled();
  });

  it('persists only a private Blob URL and marks both rows pending', async () => {
    mocks.prisma.profile.findUnique.mockResolvedValue({ verificationStatus: 'unverified' });
    mocks.prisma.idVerification.findUnique.mockResolvedValue(null);
    mocks.prisma.idVerification.upsert.mockResolvedValue({});
    mocks.prisma.profile.update.mockResolvedValue({});
    const { POST } = await import('@/app/api/profile/verification-id/route');

    const response = await POST(
      request(
        completionEvent(
          { pathname: PRIVATE_PATH, url: PRIVATE_URL },
          { kind: 'verification-id', userId: USER_ID },
        ),
        '/api/profile/verification-id',
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.idVerification.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID },
        create: expect.objectContaining({ imagePath: PRIVATE_URL, status: 'pending' }),
        update: expect.objectContaining({
          imagePath: PRIVATE_URL,
          status: 'pending',
          reviewedAt: null,
        }),
      }),
    );
    expect(mocks.prisma.profile.update).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { verificationStatus: 'pending' },
    });
  });

  it('rejects a completion URL that is not from private Vercel Blob', async () => {
    mocks.prisma.profile.findUnique.mockResolvedValue({ verificationStatus: 'unverified' });
    mocks.prisma.idVerification.findUnique.mockResolvedValue(null);
    const { POST } = await import('@/app/api/profile/verification-id/route');

    const response = await POST(
      request(
        completionEvent(
          {
            pathname: PRIVATE_PATH,
            url: 'https://id-store.public.blob.vercel-storage.com/leaked-id.png',
          },
          { kind: 'verification-id', userId: USER_ID },
        ),
        '/api/profile/verification-id',
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.idVerification.upsert).not.toHaveBeenCalled();
  });
});

describe('admin private verification image route', () => {
  it('rejects a signed-in non-admin before reading Prisma or Blob', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'member', role: 'user' } });
    const { GET } = await import('@/app/api/admin/verifications/[userId]/image/route');

    const response = await GET(new Request('http://test/id'), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(403);
    expect(mocks.prisma.idVerification.findUnique).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('streams the DB-selected private Blob with no-store response headers', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    mocks.prisma.idVerification.findUnique.mockResolvedValue({ imagePath: PRIVATE_URL });
    mocks.get.mockResolvedValue({
      statusCode: 200,
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('image'));
          controller.close();
        },
      }),
      blob: { contentType: 'image/png' },
    });
    const { GET } = await import('@/app/api/admin/verifications/[userId]/image/route');

    const response = await GET(new Request('http://test/id'), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(mocks.get).toHaveBeenCalledWith(PRIVATE_URL, {
      access: 'private',
      token: 'vercel_blob_rw_verification',
      useCache: false,
    });
  });

  it('returns 404 after retention clears the image path', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    mocks.prisma.idVerification.findUnique.mockResolvedValue({ imagePath: null });
    const { GET } = await import('@/app/api/admin/verifications/[userId]/image/route');

    const response = await GET(new Request('http://test/id'), {
      params: Promise.resolve({ userId: USER_ID }),
    });

    expect(response.status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
  });
});

describe('admin verification listing and retention', () => {
  it('returns an authorized same-origin image route, never the private Blob URL', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    mocks.prisma.profile.findMany.mockResolvedValue([
      {
        id: 'profile-1',
        userId: USER_ID,
        age: 62,
        location: 'Pennsylvania',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    mocks.prisma.idVerification.findMany.mockResolvedValue([
      {
        userId: USER_ID,
        status: 'pending',
        submittedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
    ]);
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: USER_ID, name: 'Member', email: 'member@example.test' },
    ]);
    const { GET } = await import('@/app/api/admin/verifications/route');

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.items[0].imagePath).toBe(`/api/admin/verifications/${USER_ID}/image`);
    expect(JSON.stringify(body)).not.toContain('blob.vercel-storage.com');
  });

  it('deletes the private ID before recording an approval and clears retained image metadata', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 'admin', role: 'admin' } });
    mocks.prisma.profile.findUnique
      .mockResolvedValueOnce({
        id: 'profile-1',
        userId: USER_ID,
        age: 62,
        location: 'Pennsylvania',
        verificationStatus: 'pending',
      })
      .mockResolvedValueOnce({
        userId: USER_ID,
        age: 62,
        location: 'Pennsylvania',
      });
    mocks.prisma.idVerification.findUnique
      .mockResolvedValueOnce({ imagePath: PRIVATE_URL, status: 'pending' })
      .mockResolvedValueOnce({
        status: 'approved',
        submittedAt: new Date('2026-01-02T00:00:00.000Z'),
      });
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: USER_ID,
      name: 'Member',
      email: 'member@example.test',
    });
    mocks.prisma.profile.update.mockResolvedValue({});
    mocks.prisma.idVerification.update.mockResolvedValue({});

    const { POST } = await import('@/app/api/admin/verifications/[userId]/route');
    const response = await POST(
      request({ action: 'approve' }, `/api/admin/verifications/${USER_ID}`),
      { params: Promise.resolve({ userId: USER_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.del).toHaveBeenCalledWith(PRIVATE_URL, {
      token: 'vercel_blob_rw_verification',
    });
    expect(mocks.prisma.idVerification.update).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: {
        status: 'approved',
        imagePath: null,
        reviewedAt: expect.any(Date),
      },
    });
    expect(mocks.del.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.prisma.idVerification.update.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
  });
});
