// @polsia:user-owned — matching-feed Block API.
//
// POST /api/blocks creates a one-way block: row(blockerId=A, blockedId=B)
// means A hides B from future feed/discover results. Self-target returns 400.
// Concurrent writes are resolved by the (blockerId, blockedId) unique index.
//
// GET /api/blocks returns the authed viewer's block list (newest first) with
// the blocked user's display name joined in. Profile reads are intentionally
// avoided: a block whose target never completed onboarding must still appear.
//
// DELETE /api/blocks removes the row keyed on (blockerId=session.id, blockedId).
// 404 if the row does not exist (idempotent miss → NOT 403, to avoid leaking
// that the row exists for some other user).

import 'server-only';
import { NextResponse } from 'next/server';
import {
  BlockCreate,
  BlockDelete,
  BlockDeleteResult,
  BlockListEnvelope,
  BlockListItem,
  BlockResult,
} from '@/lib/contracts/blocks';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

// Duck-typed P2002 check — Prisma's `PrismaClientKnownRequestError` lives
// behind `@prisma/client`, and the route runs in a context where the unique
// index is the contract, so we just look at the `.code` property directly.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code === 'P2002'
  );
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as { code: unknown }).code === 'string' &&
    (err as { code: string }).code === 'P2025'
  );
}

function flattenError(err: import('zod').ZodError): Record<string, string> {
  return Object.fromEntries(
    Object.entries(err.flatten().fieldErrors)
      .map(([field, messages]) => [field, messages?.[0] ?? ''])
      .filter(([, msg]) => Boolean(msg)),
  );
}

export async function POST(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = BlockCreate.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }
  const { toUserId } = parsed.data;

  if (toUserId === auth.session.id) {
    return NextResponse.json(
      { errors: { toUserId: 'You cannot block yourself.' } },
      { status: 400 },
    );
  }

  // The (blockerId, blockedId) unique index makes the write idempotent. If a
  // row exists, fetch + return it with `idempotent: true`; only create on the
  // first attempt. `idempotent` is OMITTED (not `false`) from the create-path
  // payload so the JSON output carries no `idempotent` key — the absence
  // itself signals "this was a real write".
  function shape(
    row: { id: string; blockerId: string; blockedId: string; createdAt: Date },
    idempotent: boolean | undefined,
  ) {
    return BlockResult.parse({
      id: row.id,
      blockerId: row.blockerId,
      blockedId: row.blockedId,
      createdAt: row.createdAt.toISOString(),
      idempotent,
    });
  }

  const existing = await prisma.block.findUnique({
    where: { blockerId_blockedId: { blockerId: auth.session.id, blockedId: toUserId } },
  });
  if (existing) {
    return NextResponse.json(shape(existing, true), { status: 200 });
  }

  try {
    const created = await prisma.block.create({
      data: { blockerId: auth.session.id, blockedId: toUserId },
    });
    return NextResponse.json(shape(created, undefined), { status: 200 });
  } catch (err) {
    // Concurrent block from the same viewer on the same target — race resolved
    // by the unique index. Look up the winning row.
    if (isUniqueViolation(err)) {
      const winner = await prisma.block.findUnique({
        where: { blockerId_blockedId: { blockerId: auth.session.id, blockedId: toUserId } },
      });
      if (winner) return NextResponse.json(shape(winner, true), { status: 200 });
    }
    return NextResponse.json({ error: 'Could not record block' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const rows = await prisma.block.findMany({
    where: { blockerId: auth.session.id },
    orderBy: { createdAt: 'desc' },
  });

  const nameById = new Map<string, string>();
  if (rows.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: rows.map((r) => r.blockedId) } },
      select: { id: true, name: true },
    });
    for (const u of users) nameById.set(u.id, u.name);
  }

  const items = rows.map((row) =>
    BlockListItem.parse({
      id: row.id,
      blockedId: row.blockedId,
      blockedName: nameById.get(row.blockedId) ?? '',
      createdAt: row.createdAt.toISOString(),
    }),
  );

  return NextResponse.json(BlockListEnvelope.parse({ items }), { status: 200 });
}

export async function DELETE(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const parsed = BlockDelete.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ errors: flattenError(parsed.error) }, { status: 400 });
  }
  const { blockedId } = parsed.data;

  try {
    const deleted = await prisma.block.delete({
      where: { blockerId_blockedId: { blockerId: auth.session.id, blockedId } },
    });
    return NextResponse.json(
      BlockDeleteResult.parse({ id: deleted.id, blockedId: deleted.blockedId }),
      { status: 200 },
    );
  } catch (err) {
    if (isNotFound(err)) {
      return NextResponse.json({ error: 'Block not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Could not remove block' }, { status: 500 });
  }
}
