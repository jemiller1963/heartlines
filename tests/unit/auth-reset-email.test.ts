// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/email/resend', () => ({
  sendEmail: mocks.sendEmail,
}));

describe('Better Auth password reset email', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.sendEmail.mockResolvedValue({ id: 'email_test_123' });
  });

  it('passes Better Auth generated reset URL through to the email transport', async () => {
    const { authConfig } = await import('@/lib/auth-config');

    const handler = authConfig.emailAndPassword?.sendResetPassword as unknown as (args: {
      user: {
        email: string;
        name: string | null;
      };
      url: string;
    }) => Promise<void>;

    const resetUrl =
      'https://heartlines-phase2-preview.vercel.app/reset-password/test-token?callbackURL=%2F';

    await handler({
      user: {
        email: 'member@example.com',
        name: 'Avery',
      },
      url: resetUrl,
    });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    const args = mocks.sendEmail.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
      text?: string;
    };

    expect(args.to).toBe('member@example.com');
    expect(args.subject).toBe('Reset your Heart Lines password');
    expect(args.html).toContain(resetUrl);
    expect(args.text).toContain(resetUrl);
  });

  it('swallows email transport failures', async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error('provider unavailable'));

    const { authConfig } = await import('@/lib/auth-config');

    const handler = authConfig.emailAndPassword?.sendResetPassword as unknown as (args: {
      user: {
        email: string;
        name: string | null;
      };
      url: string;
    }) => Promise<void>;

    await expect(
      handler({
        user: {
          email: 'member@example.com',
          name: 'Avery',
        },
        url: 'https://example.com/reset/token',
      }),
    ).resolves.toBeUndefined();
  });
});
