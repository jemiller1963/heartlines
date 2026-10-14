// @polsia:user-owned — configure better-auth here (spread into betterAuth() by @/lib/auth).
// Add emailAndPassword options, plugins, session, socialProviders, databaseHooks, etc.
// Framework owns db/secret/baseURL/admin() + the owner-admin grant (no-op if set here).
//
// Welcome email / signup side-effect (runs alongside the owner-admin grant — install `email`):
//   import { sendEmail } from '@/lib/email/resend';
//   databaseHooks: { user: { create: { after: async (user) => {
//     await sendEmail({ to: user.email, subject: 'Welcome', html: '<p>Welcome!</p>' }).catch(() => {});
//   } } } },
// Add a plugin: `plugins: [organization()]` (admin() is added for you).
//
// Per-user fields (a `username`, profile, prefs): don't add a column to `User` (auth.prisma
// is locked) or use `user.additionalFields` (needs that locked column). Make a user-owned
// `prisma/schema/profile.prisma` (model UserProfile { userId String @unique /* fields */ },
// scalar userId) and create the row at signup:
//   import { prisma } from '@/lib/db';
//   databaseHooks: { user: { create: { after: async (user) => {
//     await prisma.userProfile.create({ data: { userId: user.id } }).catch(() => {});
//   } } } },

import type { BetterAuthOptions } from 'better-auth';
import { sendEmail } from '@/lib/email/resend';
import { passwordResetEmail } from '@/lib/email/templates';

const ADMIN_EMAILS = new Set(['inked2gether@yahoo.com', 'jemiller1963@gmail.com']);

const adminPromotion = {
  user: {
    create: {
      after: async (user: { id: string; email: string }) => {
        if (!ADMIN_EMAILS.has(user.email.toLowerCase())) return;
        const { prisma } = await import('@/lib/db');
        await prisma.user
          .update({
            where: { id: user.id },
            data: { role: 'admin', updatedAt: new Date() },
          })
          .catch(() => {});
      },
    },
  },
};

export const authConfig: BetterAuthOptions = {
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // better-auth fires this once for a valid email and passes a fully-formed URL
    // (`${BETTER_AUTH_URL}/reset-password/${token}?callbackURL=${redirectTo}`).
    // We embed `url` verbatim and escape anything user-derived. The .catch swallows
    // email transport failures so a mail outage does NOT 500 the request — the
    // password reset Verification row has already been written by better-auth.
    async sendResetPassword({ user, url }) {
      try {
        await sendEmail({
          to: user.email,
          ...passwordResetEmail({
            name: user.name,
            resetUrl: url,
          }),
        });
      } catch (_err) {}
    },
  },
  trustedOrigins: ['https://heart-lines.polsia.io', 'https://heart-lines.polsia.app'],
  databaseHooks: adminPromotion,
};
