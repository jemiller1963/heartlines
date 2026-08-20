// @vitest-environment node
// @polsia:user-owned — vitest for POST/GET/DELETE /api/blocks + the shared
// BlockCreate/BlockResult/BlockDelete/BlockListEnvelope contracts.
//
// // @vitest-environment node is required: vitest defaults to jsdom, which
// would rewrite import.meta.url and break server-only / Prisma resolution.
// Neutralize server-only (`import 'server-only'` is a side-effect-only
// module, so replacing it with an empty object is enough) and stub Prisma +
// requireAuth so the handler runs against a fake DB.
//
// Negative-space invariant for the `block` table: `mocks.prisma.profile` is
// intentionally NOT defined so that any handler code path that accidentally
// queries profile state throws on access. The handler must not read profile
// state for the blocked user — even if they have no profile, the block is
// still recorded.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

// --- contract ----------------------------------------------------------------

describe('blocks shared contract', () => {
  it('BlockCreate accepts a valid toUserId (re-exported from swipe UserId)', async () => {
    const { BlockCreate } = await import('@/lib/contracts/blocks');
    expect(BlockCreate.safeParse({ toUserId: 'a'.repeat(32) }).success).toBe(true);
  });

  it('BlockCreate rejects an empty toUserId and an oversize id', async () => {
    const { BlockCreate } = await import('@/lib/contracts/blocks');
    expect(BlockCreate.safeParse({ toUserId: '' }).success).toBe(false);
    expect(BlockCreate.safeParse({ toUserId: 'a'.repeat(65) }).success).toBe(false);
  });

  it('BlockCreate rejects a missing toUserId', async () => {
    const { BlockCreate } = await import('@/lib/contracts/blocks');
    expect(BlockCreate.safeParse({}).success).toBe(false);
  });

  it('BlockResult accepts a shape with explicit idempotent: true', async () => {
    const { BlockResult } = await import('@/lib/contracts/blocks');
    expect(
      BlockResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        blockerId: 'viewer',
        blockedId: 'target',
        createdAt: '2026-07-31T00:00:00.000Z',
        idempotent: true,
      }).success,
    ).toBe(true);
  });

  it('BlockResult accepts a shape with idempotent absent (the create-path shape)', async () => {
    const { BlockResult } = await import('@/lib/contracts/blocks');
    expect(
      BlockResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        blockerId: 'viewer',
        blockedId: 'target',
        createdAt: '2026-07-31T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('BlockResult rejects a non-datetime createdAt', async () => {
    const { BlockResult } = await import('@/lib/contracts/blocks');
    expect(
      BlockResult.safeParse({
        id: `c${'a'.repeat(24)}`,
        blockerId: 'viewer',
        blockedId: 'target',
        createdAt: 'yesterday',
      }).success,
    ).toBe(false);
  });

  it('BlockDelete accepts a valid blockedId (reuses swipe UserId)', async () => {
    const { BlockDelete } = await import('@/lib/contracts/blocks');
    expect(BlockDelete.safeParse({ blockedId: 'a'.repeat(32) }).success).toBe(true);
  });

  it('BlockDelete rejects a missing blockedId', async () => {
    const { BlockDelete } = await import('@/lib/contracts/blocks');
    expect(BlockDelete.safeParse({}).success).toBe(false);
  });

  it('BlockListEnvelope validates the list shape', async () => {
    const { BlockListEnvelope } = await import('@/lib/contracts/blocks');
    expect(
      BlockListEnvelope.safeParse({
        items: [
          {
            id: `c${'b'.repeat(24)}`,
            blockedId: 'target',
            blockedName: 'Sam',
            createdAt: '2026-07-31T00:00:00.000Z',
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('BlockListEnvelope rejects a non-datetime createdAt inside an item', async () => {
    const { BlockListEnvelope } = await import('@/lib/contracts/blocks');
    expect(
      BlockListEnvelope.safeParse({
        items: [{ id: 'x', blockedId: 't', blockedName: 'Sam', createdAt: 'yesterday' }],
      }).success,
    ).toBe(false);
  });
});

// --- route handler -----------------------------------------------------------

const mocks = vi.hoisted(() => {
  const prisma = {
    block: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  };
  const requireAuth = vi.fn();
  return { prisma, requireAuth };
});

vi.mock('@/lib/db', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/require-auth', () => ({
  requireAuth: mocks.requireAuth,
  getSessionUser: vi.fn(),
}));

const VIEWER_ID = 'viewer-user-abc';
const TARGET_ID = 'target-user-xyz';
const SECOND_ID = 'target-user-pqr';

function authed(id = VIEWER_ID) {
  mocks.requireAuth.mockResolvedValue({ id, email: 'v@x' });
}

function blockRow(args: { id: string; blockerId: string; blockedId: string; createdAt: Date }) {
  return {
    id: args.id,
    blockerId: args.blockerId,
    blockedId: args.blockedId,
    createdAt: args.createdAt,
  };
}

function p2002() {
  // The handler duck-types Prisma's error code, so a plain object with `.code`
  // is enough — keeps `@prisma/client` out of the test file's imports.
  return Object.assign(new Error('unique constraint violation'), { code: 'P2002' });
}

function p2025() {
  // Same duck-type as P2002 but the "row not found" code on `delete`.
  return Object.assign(new Error('record not found'), { code: 'P2025' });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.block.findUnique.mockReset();
  mocks.prisma.block.findMany.mockReset();
  mocks.prisma.block.create.mockReset();
  mocks.prisma.block.delete.mockReset();
  mocks.prisma.user.findMany.mockReset();
  mocks.requireAuth.mockReset();
});

const postRoute = () => import('@/app/api/blocks/route');
const getRoute = () => import('@/app/api/blocks/route');
const deleteRoute = () => import('@/app/api/blocks/route');

describe('POST /api/blocks — auth + input gates', () => {
  it('401 when requireAuth rejects (no Prisma calls)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { POST } = await postRoute();
    const res = await POST(new Request('http://test/api/blocks', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(401);
    expect(mocks.prisma.block.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.block.create).not.toHaveBeenCalled();
  });

  it('400 on self-target (toUserId === session.id) — no Prisma calls', async () => {
    authed();
    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ toUserId: VIEWER_ID }),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.toUserId).toBeTruthy();
    expect(mocks.prisma.block.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.block.create).not.toHaveBeenCalled();
  });

  it('400 on missing/invalid toUserId — no Prisma calls', async () => {
    authed();
    const { POST } = await postRoute();
    const res = await POST(new Request('http://test/api/blocks', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
    expect(mocks.prisma.block.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.block.create).not.toHaveBeenCalled();
  });
});

describe('POST /api/blocks — happy path', () => {
  it('200 on first create; idempotent key is absent from the JSON body', async () => {
    authed();
    mocks.prisma.block.findUnique.mockResolvedValue(null);
    const BLOCK_ID = `c${'b'.repeat(24)}`;
    const CREATED_AT = new Date('2026-07-31T00:00:00.000Z');
    mocks.prisma.block.create.mockResolvedValue(
      blockRow({ id: BLOCK_ID, blockerId: VIEWER_ID, blockedId: TARGET_ID, createdAt: CREATED_AT }),
    );

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ toUserId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(200);

    // Body verifies the contract shape.
    const body = await res.json();
    expect(body.id).toBe(BLOCK_ID);
    expect(body.blockerId).toBe(VIEWER_ID);
    expect(body.blockedId).toBe(TARGET_ID);
    expect(body.createdAt).toBe(CREATED_AT.toISOString());

    // Critical: on a real create, the `idempotent` key MUST be absent.
    // (`NextResponse.json` strips `undefined` via JSON.stringify, so the key
    // is gone from the wire, not merely falsy.)
    expect('idempotent' in body).toBe(false);

    // blockerId is sourced from session, NEVER from the body.
    const createArgs = mocks.prisma.block.create.mock.calls[0]?.[0];
    expect(createArgs?.data?.blockerId).toBe(VIEWER_ID);
    expect(createArgs?.data?.blockedId).toBe(TARGET_ID);

    // The findUnique pre-check ran before create.
    expect(mocks.prisma.block.findUnique).toHaveBeenCalledTimes(1);
  });

  it('200 on re-block (existing row); idempotent: true; create is NOT called', async () => {
    authed();
    const BLOCK_ID = `c${'c'.repeat(24)}`;
    const CREATED_AT = new Date('2026-06-01T00:00:00.000Z');
    mocks.prisma.block.findUnique.mockResolvedValue(
      blockRow({ id: BLOCK_ID, blockerId: VIEWER_ID, blockedId: TARGET_ID, createdAt: CREATED_AT }),
    );

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ toUserId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(BLOCK_ID);
    expect(body.idempotent).toBe(true);
    expect(body.blockerId).toBe(VIEWER_ID);
    expect(body.blockedId).toBe(TARGET_ID);

    // The existing-row branch must NOT call create.
    expect(mocks.prisma.block.create).not.toHaveBeenCalled();
  });

  it('missing profile for blockedId does NOT block the create (handler must not query profile)', async () => {
    authed();
    // The `profile` namespace is intentionally absent from the mock. If the
    // handler accidentally reads `prisma.profile.*`, this throws on access.
    // This guards the brief's invariant against reading profile state for
    // the block target.
    mocks.prisma.block.findUnique.mockResolvedValue(null);
    const BLOCK_ID = `c${'d'.repeat(24)}`;
    mocks.prisma.block.create.mockResolvedValue(
      blockRow({
        id: BLOCK_ID,
        blockerId: VIEWER_ID,
        blockedId: TARGET_ID,
        createdAt: new Date('2026-07-31T00:00:00.000Z'),
      }),
    );

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ toUserId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: BLOCK_ID, blockerId: VIEWER_ID });
  });
});

describe('POST /api/blocks — concurrency (P2002 on create)', () => {
  it('200 + idempotent: true when the create hits the unique constraint; look up the winning row', async () => {
    authed();
    mocks.prisma.block.findUnique
      .mockResolvedValueOnce(null) // pre-check: no row yet
      .mockResolvedValueOnce(
        // post-P2002 lookup: the winning row
        blockRow({
          id: `c${'e'.repeat(24)}`,
          blockerId: VIEWER_ID,
          blockedId: TARGET_ID,
          createdAt: new Date('2026-07-31T00:00:00.000Z'),
        }),
      );
    mocks.prisma.block.create.mockRejectedValue(p2002());

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ toUserId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.idempotent).toBe(true);
    expect(body.blockerId).toBe(VIEWER_ID);
    expect(body.blockedId).toBe(TARGET_ID);
  });

  it('500 on a non-P2002 create error', async () => {
    authed();
    mocks.prisma.block.findUnique.mockResolvedValue(null);
    mocks.prisma.block.create.mockRejectedValue(new Error('boom'));

    const { POST } = await postRoute();
    const res = await POST(
      new Request('http://test/api/blocks', {
        method: 'POST',
        body: JSON.stringify({ toUserId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not record block' });
  });
});

// --- GET /api/blocks --------------------------------------------------------

describe('GET /api/blocks — auth + scoping', () => {
  it('401 when requireAuth rejects (no Prisma calls)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/blocks', { method: 'GET' }));
    expect(res.status).toBe(401);
    expect(mocks.prisma.block.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('200 returns the joined list with display names; session.id scopes the find', async () => {
    authed();
    const ROW_A = blockRow({
      id: `c${'a'.repeat(24)}`,
      blockerId: VIEWER_ID,
      blockedId: TARGET_ID,
      createdAt: new Date('2026-07-31T00:00:00.000Z'),
    });
    const ROW_B = blockRow({
      id: `c${'b'.repeat(24)}`,
      blockerId: VIEWER_ID,
      blockedId: SECOND_ID,
      createdAt: new Date('2026-07-30T00:00:00.000Z'),
    });
    mocks.prisma.block.findMany.mockResolvedValue([ROW_A, ROW_B]);
    mocks.prisma.user.findMany.mockResolvedValue([
      { id: TARGET_ID, name: 'Sam One' },
      { id: SECOND_ID, name: 'Sam Two' },
    ]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/blocks', { method: 'GET' }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({
      id: ROW_A.id,
      blockedId: TARGET_ID,
      blockedName: 'Sam One',
      createdAt: '2026-07-31T00:00:00.000Z',
    });
    expect(body.items[1]).toMatchObject({
      id: ROW_B.id,
      blockedId: SECOND_ID,
      blockedName: 'Sam Two',
      createdAt: '2026-07-30T00:00:00.000Z',
    });

    // Find is scoped to the session.id of the authed viewer.
    const findArgs = mocks.prisma.block.findMany.mock.calls[0]?.[0];
    expect(findArgs?.where?.blockerId).toBe(VIEWER_ID);

    // User join is batched, not per-row.
    expect(mocks.prisma.user.findMany).toHaveBeenCalledTimes(1);
    const userArgs = mocks.prisma.user.findMany.mock.calls[0]?.[0];
    expect(userArgs?.where?.id?.in).toEqual([TARGET_ID, SECOND_ID]);
  });

  it('200 returns empty envelope when viewer has no blocks; User join is NOT called', async () => {
    authed();
    mocks.prisma.block.findMany.mockResolvedValue([]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/blocks', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ items: [] });
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('missing user for a blockedId returns a blank blockedName, NOT an error', async () => {
    authed();
    mocks.prisma.block.findMany.mockResolvedValue([
      blockRow({
        id: `c${'a'.repeat(24)}`,
        blockerId: VIEWER_ID,
        blockedId: TARGET_ID,
        createdAt: new Date('2026-07-31T00:00:00.000Z'),
      }),
    ]);
    // No User row matches — the block's UI row still surfaces with a blank name.
    mocks.prisma.user.findMany.mockResolvedValue([]);

    const { GET } = await getRoute();
    const res = await GET(new Request('http://test/api/blocks', { method: 'GET' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items[0].blockedId).toBe(TARGET_ID);
    expect(body.items[0].blockedName).toBe('');
  });
});

// --- DELETE /api/blocks -----------------------------------------------------

describe('DELETE /api/blocks — auth + input gates', () => {
  it('401 when requireAuth rejects (no Prisma calls)', async () => {
    mocks.requireAuth.mockImplementation(() => {
      throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    });
    const { DELETE } = await deleteRoute();
    const res = await DELETE(
      new Request('http://test/api/blocks', {
        method: 'DELETE',
        body: JSON.stringify({ blockedId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(401);
    expect(mocks.prisma.block.delete).not.toHaveBeenCalled();
  });

  it('400 on missing blockedId (no Prisma delete call)', async () => {
    authed();
    const { DELETE } = await deleteRoute();
    const res = await DELETE(
      new Request('http://test/api/blocks', { method: 'DELETE', body: '{}' }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.errors?.blockedId).toBeTruthy();
    expect(mocks.prisma.block.delete).not.toHaveBeenCalled();
  });

  it('400 on invalid blockedId shape (no Prisma delete call)', async () => {
    authed();
    const { DELETE } = await deleteRoute();
    const res = await DELETE(
      new Request('http://test/api/blocks', {
        method: 'DELETE',
        body: JSON.stringify({ blockedId: '' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(mocks.prisma.block.delete).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/blocks — happy path + not found', () => {
  it('200 returns { id, blockedId }; where.blockerId_blockedId is scoped to the session', async () => {
    authed();
    const BLOCK_ID = `c${'f'.repeat(24)}`;
    mocks.prisma.block.delete.mockResolvedValue({
      id: BLOCK_ID,
      blockerId: VIEWER_ID,
      blockedId: TARGET_ID,
      createdAt: new Date('2026-07-31T00:00:00.000Z'),
    });

    const { DELETE } = await deleteRoute();
    const res = await DELETE(
      new Request('http://test/api/blocks', {
        method: 'DELETE',
        body: JSON.stringify({ blockedId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({ id: BLOCK_ID, blockedId: TARGET_ID });

    // Composite key is composed of session.id and the body field — no other
    // sources contribute, so a stale id cannot over-delete.
    const deleteArgs = mocks.prisma.block.delete.mock.calls[0]?.[0];
    expect(deleteArgs?.where?.blockerId_blockedId).toEqual({
      blockerId: VIEWER_ID,
      blockedId: TARGET_ID,
    });
  });

  it('404 on P2025 from block.delete (idempotent miss → no 500 leak)', async () => {
    authed();
    mocks.prisma.block.delete.mockRejectedValue(p2025());

    const { DELETE } = await deleteRoute();
    const res = await DELETE(
      new Request('http://test/api/blocks', {
        method: 'DELETE',
        body: JSON.stringify({ blockedId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Block not found');
  });

  it('500 on a non-P2025 delete error', async () => {
    authed();
    mocks.prisma.block.delete.mockRejectedValue(new Error('boom'));

    const { DELETE } = await deleteRoute();
    const res = await DELETE(
      new Request('http://test/api/blocks', {
        method: 'DELETE',
        body: JSON.stringify({ blockedId: TARGET_ID }),
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Could not remove block' });
  });
});
