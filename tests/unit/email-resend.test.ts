// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: mocks.send,
    };
  },
}));

describe('Resend transactional email transport', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    process.env.RESEND_API_KEY = 're_test_key';
    process.env.EMAIL_FROM = 'Heart Lines <no-reply@example.com>';
    delete process.env.EMAIL_REPLY_TO;

    mocks.send.mockResolvedValue({
      data: { id: 'email_test_123' },
      error: null,
    });
  });

  it('sends HTML and text email through Resend', async () => {
    const { sendEmail } = await import('@/lib/email/resend');

    const result = await sendEmail({
      to: 'member@example.com',
      subject: 'Test message',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledWith({
      from: 'Heart Lines <no-reply@example.com>',
      to: 'member@example.com',
      subject: 'Test message',
      html: '<p>Hello</p>',
      text: 'Hello',
    });

    expect(result).toEqual({ id: 'email_test_123' });
  });

  it('uses EMAIL_REPLY_TO when configured', async () => {
    process.env.EMAIL_REPLY_TO = 'support@example.com';

    const { sendEmail } = await import('@/lib/email/resend');

    await sendEmail({
      to: 'member@example.com',
      subject: 'Test message',
      html: '<p>Hello</p>',
    });

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: 'support@example.com',
      }),
    );
  });

  it('allows a per-message replyTo to override EMAIL_REPLY_TO', async () => {
    process.env.EMAIL_REPLY_TO = 'support@example.com';

    const { sendEmail } = await import('@/lib/email/resend');

    await sendEmail({
      to: 'member@example.com',
      subject: 'Test message',
      html: '<p>Hello</p>',
      replyTo: 'other@example.com',
    });

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        replyTo: 'other@example.com',
      }),
    );
  });

  it('throws when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;

    const { sendEmail } = await import('@/lib/email/resend');

    await expect(
      sendEmail({
        to: 'member@example.com',
        subject: 'Test message',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow('RESEND_API_KEY is required');
  });

  it('throws when EMAIL_FROM is missing', async () => {
    delete process.env.EMAIL_FROM;

    const { sendEmail } = await import('@/lib/email/resend');

    await expect(
      sendEmail({
        to: 'member@example.com',
        subject: 'Test message',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow('EMAIL_FROM is required');
  });

  it('propagates Resend provider errors', async () => {
    mocks.send.mockResolvedValueOnce({
      data: null,
      error: { message: 'provider failure' },
    });

    const { sendEmail } = await import('@/lib/email/resend');

    await expect(
      sendEmail({
        to: 'member@example.com',
        subject: 'Test message',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow('Resend email send failed: provider failure');
  });

  it('fails closed when Resend returns no message id', async () => {
    mocks.send.mockResolvedValueOnce({
      data: null,
      error: null,
    });

    const { sendEmail } = await import('@/lib/email/resend');

    await expect(
      sendEmail({
        to: 'member@example.com',
        subject: 'Test message',
        html: '<p>Hello</p>',
      }),
    ).rejects.toThrow('no message id returned');
  });
});
