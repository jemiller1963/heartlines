// @polsia:user-owned — POST /api/waitlist. Persists a landing-page signup and
// fires a confirmation email via the platform email proxy.
//
// Public/anonymous: NO requireAuth() (waitlist is a landing-page signup).
// Validation runs through the zod contract BEFORE we touch Prisma. The
// confirmation send runs AFTER the DB insert (so we don't email an address
// we never persisted) but is wrapped in try/catch and never lets its failure
// mask a successful signup response (won't 500 due to a missing config).
import 'server-only';

import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { WaitlistSignupCreate, WaitlistSignupItem } from '@/lib/contracts/waitlist';
import { prisma } from '@/lib/db';
import { sendEmail } from '@/lib/email/send';
import { waitlistConfirmation } from '@/lib/email/templates';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const parsed = WaitlistSignupCreate.safeParse(await req.json());
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const errors: Record<string, string> = {};
      for (const [field, messages] of Object.entries(fieldErrors)) {
        const message = messages?.[0];
        if (message) {
          errors[field] = message;
        }
      }
      return NextResponse.json({ errors }, { status: 400 });
    }
    const { email } = parsed.data;

    let signup: Awaited<ReturnType<typeof prisma.waitlistSignup.create>>;
    try {
      signup = await prisma.waitlistSignup.create({
        data: { email },
      });
    } catch (err) {
      // P2002 = unique-constraint hit: the visitor is already on the list.
      // Idempotently return the existing row + still send the confirmation.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await prisma.waitlistSignup.findUnique({ where: { email } });
        if (existing) {
          await sendConfirmationEmail(email);
          return NextResponse.json(
            WaitlistSignupItem.parse({
              id: existing.id,
              email: existing.email,
              createdAt: existing.createdAt.toISOString(),
            }),
            { status: 200 },
          );
        }
      }
      throw err;
    }

    await sendConfirmationEmail(email);

    return NextResponse.json(
      WaitlistSignupItem.parse({
        id: signup.id,
        email: signup.email,
        createdAt: signup.createdAt.toISOString(),
      }),
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

async function sendConfirmationEmail(to: string): Promise<void> {
  try {
    await sendEmail({
      to,
      ...waitlistConfirmation({ ctaUrl: '/' }),
    });
  } catch {
    // Swallow: a failed email send MUST NOT fail the signup response.
  }
}
