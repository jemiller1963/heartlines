// @polsia:user-owned — configure better-auth here (spread into betterAuth() by @/lib/auth).
// Add emailAndPassword options, plugins, session, socialProviders, databaseHooks, etc.
// Framework owns db/secret/baseURL/admin() + the owner-admin grant (no-op if set here).
//
// Welcome email / signup side-effect (runs alongside the owner-admin grant — install `email`):
//   import { sendEmail } from '@/lib/email/send';
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
import { sendEmail } from '@/lib/email/send';
import { escapeHtml } from '@/lib/email/templates';

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
    // proxy transport failures so a mail outage does NOT 500 the request — the
    // password reset Verification row has already been written by better-auth.
    async sendResetPassword({ user, url }) {
      const html = [
        `<p>Hi ${escapeHtml(user.name ?? 'there')},</p>`,
        '<p>We received a request to reset your Heart Lines password. Click the button below to choose a new one — this link expires in about an hour.</p>',
        `<p style="margin:24px 0;"><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 20px;background:#c2654a;color:#ffffff;text-decoration:none;font-size:15px;border-radius:6px;">Reset your password</a></p>`,
        "<p>If you didn't request this, you can safely ignore this email — your password will stay the same.</p>",
      ].join('');
      // plaintext sibling so plain-text readers + spam filters see the URL verbatim;
      // derive the proxy base the same way src/lib/email/send.ts does so /contacts
      // and /send resolve to the same host.
      const text = [
        `Hi ${user.name ?? 'there'},`,
        '',
        'We received a request to reset your Heart Lines password. Use the link below to choose a new one — it expires in about an hour.',
        '',
        url,
        '',
        "If you didn't request this, you can safely ignore this email — your password will stay the same.",
      ].join('\n');
      // Best-effort contact registration so the proxy knows the recipient before send.
      // A failure here must NOT block the actual reset email.
      const proxyBase = (process.env.POLSIA_EMAIL_PROXY_URL ?? '')
        .replace(/\/+$/, '')
        .replace(/\/send$/, '');
      try {
        await fetch(`${proxyBase}/contacts`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${process.env.POLSIA_API_KEY ?? ''}`,
          },
          body: JSON.stringify({ email: user.email, source: 'import' }),
        });
      } catch (_err) {}
      try {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Heart Lines password',
          html,
          text,
        });
      } catch (_err) {}
    },
  },
  trustedOrigins: ['https://heart-lines.polsia.io', 'https://heart-lines.polsia.app'],
  databaseHooks: adminPromotion,
};
