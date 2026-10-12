// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    waitlistSignup: {
      create: mocks.create,
      findUnique: mocks.findUnique,
    },
  },
}));

vi.mock('@/lib/email/resend', () => ({
  sendEmail: mocks.sendEmail,
}));

describe('POST /api/waitlist email behavior', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mocks.create.mockResolvedValue({
      id: 'waitlist-1',
      email: 'member@example.com',
      createdAt: new Date('2026-10-09T12:00:00.000Z'),
    });

    mocks.findUnique.mockResolvedValue(null);
    mocks.sendEmail.mockResolvedValue({ id: 'email_test_123' });
  });

  it('returns 201 and sends a confirmation email after signup', async () => {
    const { POST } = await import('@/app/api/waitlist/route');

    const res = await POST(
      new Request('http://test/api/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          email: 'member@example.com',
        }),
      }),
    );

    expect(res.status).toBe(201);

    const body = await res.json();

    expect(body).toEqual({
      id: 'waitlist-1',
      email: 'member@example.com',
      createdAt: '2026-10-09T12:00:00.000Z',
    });

    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);

    const args = mocks.sendEmail.mock.calls[0]?.[0] as {
      to: string;
      subject: string;
      html: string;
      text?: string;
    };

    expect(args.to).toBe('member@example.com');
    expect(args.subject).toBe('You are on the Heart Lines waitlist');
  });

  it('still returns 201 when confirmation email sending fails', async () => {
    mocks.sendEmail.mockRejectedValueOnce(new Error('provider unavailable'));

    const { POST } = await import('@/app/api/waitlist/route');

    const res = await POST(
      new Request('http://test/api/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          email: 'member@example.com',
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid email before touching Prisma or email transport', async () => {
    const { POST } = await import('@/app/api/waitlist/route');

    const res = await POST(
      new Request('http://test/api/waitlist', {
        method: 'POST',
        body: JSON.stringify({
          email: 'not-an-email',
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
