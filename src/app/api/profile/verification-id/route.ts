// @polsia:user-owned — owner-only identity-verification photo upload.
//
// POST stores the file under /public/uploads/verification/<userId>.<ext> on the
// host filesystem (v1 storage: same-origin via Next's static handler, deduped
// by userId so re-uploads overwrite without us tracking orphan files). It
// upserts the IdVerification row and flips Profile.verificationStatus to
// 'pending'. 409 if the profile is already in the approved state. The admin
// review slice (next) will be the only path that sets 'approved'/'rejected'.
//
// Gates on authOrResponse(req) and scopes by session.userId — never trust a
// body-supplied userId (IDOR). The Prisma PK constraint on IdVerification.userId
// is the single-source-of-truth owner check: the upsert target where-clause is
// keyed by the session user.

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
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'verification');

function verificationError(message: string) {
  return NextResponse.json({ errors: { verificationId: message } }, { status: 400 });
}

function shape(row: {
  id: string;
  userId: string;
  age: number;
  location: string;
  interests: string[];
  bio: string | null;
  avatarUrl: string | null;
  verificationStatus: 'unverified' | 'pending' | 'approved' | 'rejected' | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return ProfileItem.parse({
    id: row.id,
    userId: row.userId,
    age: row.age,
    location: row.location,
    interests: row.interests,
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
    return verificationError('Upload must be multipart/form-data.');
  }

  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return verificationError('Choose a photo to upload.');
  }
  if (file.size > MAX_BYTES) {
    return verificationError('Photo must be 5 MB or smaller.');
  }

  const ext = ALLOWED_MIME[file.type];
  if (!ext) {
    return verificationError('Photo must be a JPEG, PNG, or WEBP image.');
  }

  // Sanitize filename: never trust the client's. Filename is `<userId>.<ext>`
  // so it cannot be used to traverse or impersonate another user.
  const filename = `${auth.session.id}.${ext}`;
  const target = path.join(UPLOAD_DIR, filename);
  const imagePath = `/uploads/verification/${filename}`;

  const existing = await prisma.profile.findUnique({ where: { userId: auth.session.id } });
  if (!existing) {
    return NextResponse.json(
      { errors: { verificationId: 'Save your basics first.' } },
      { status: 404 },
    );
  }
  if (existing.verificationStatus === 'approved') {
    return NextResponse.json({ errors: { verificationId: 'Already verified.' } }, { status: 409 });
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(target, buffer);

  await prisma.idVerification.upsert({
    where: { userId: auth.session.id },
    create: {
      userId: auth.session.id,
      imagePath,
      status: 'pending',
      submittedAt: new Date(),
    },
    update: {
      imagePath,
      status: 'pending',
      submittedAt: new Date(),
    },
  });

  const updated = await prisma.profile.update({
    where: { userId: auth.session.id },
    data: { verificationStatus: 'pending' },
  });
  return NextResponse.json(shape(updated));
}
