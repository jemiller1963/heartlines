// @polsia:user-owned — owner-only profile photo upload/remove.
//
// POST stores the file under /public/uploads/<userId>.<ext> on the host
// filesystem (v1 storage: same-origin via Next's static handler, deduped
// by userId so re-uploads overwrite without us tracking orphan files).
// DELETE removes the avatar (sets avatarUrl to null AND unlinks the file).
// Both methods gate on authOrResponse(req) and scope by session.userId —
// never trust a body-supplied userId (IDOR).

import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { ProfileItem } from '@/lib/contracts/profile';
import { prisma } from '@/lib/db';
import { authOrResponse } from '@/lib/require-auth-result';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

function avatarError(message: string) {
  return NextResponse.json({ errors: { avatar: message } }, { status: 400 });
}

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
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return avatarError('Upload must be multipart/form-data.');
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return avatarError('Choose a photo to upload.');
  }
  if (file.size > MAX_BYTES) {
    return avatarError('Photo must be 5 MB or smaller.');
  }

  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return avatarError('Photo must be a JPEG, PNG, or WEBP image.');
  }

  // Sanitize filename: never trust the client's. Filename is `<userId>.<ext>`
  // so it cannot be used to traverse or impersonate another user.
  const filename = `${auth.session.id}.${ext}`;
  const target = path.join(UPLOAD_DIR, filename);
  const avatarUrl = `/uploads/${filename}`;

  const existing = await prisma.profile.findUnique({ where: { userId: auth.session.id } });
  if (!existing) {
    return NextResponse.json({ errors: { avatar: 'Save your basics first.' } }, { status: 404 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(target, buffer);

  const updated = await prisma.profile.update({
    where: { userId: auth.session.id },
    data: { avatarUrl },
  });
  return NextResponse.json(shape(updated));
}

export async function DELETE(req: Request) {
  const auth = await authOrResponse(req);
  if (!auth.ok) return auth.res;

  const existing = await prisma.profile.findUnique({ where: { userId: auth.session.id } });
  if (!existing) {
    return new NextResponse(null, { status: 404 });
  }

  if (existing.avatarUrl) {
    // Mirror the stale avatarUrl into a path we can unlink. Strip the leading
    // slash before joining so path.join does not treat it as absolute.
    const relative = existing.avatarUrl.replace(/^\/+/, '');
    if (relative.startsWith('uploads/') && !relative.includes('..') && !path.isAbsolute(relative)) {
      const absolute = path.join(process.cwd(), 'public', relative);
      try {
        await fs.unlink(absolute);
      } catch {
        // File already gone (e.g. fresh deploy) — silent success is fine.
      }
    }
  }

  const updated = await prisma.profile.update({
    where: { userId: auth.session.id },
    data: { avatarUrl: null },
  });
  return NextResponse.json(shape(updated));
}
