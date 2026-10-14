import { describe, expect, it } from 'vitest';
import { passwordResetEmail } from '@/lib/email/templates';

describe('passwordResetEmail', () => {
  it('includes the Better Auth reset URL in HTML and plaintext', () => {
    const resetUrl =
      'https://heartlines-phase2-preview.vercel.app/reset-password/test-token?callbackURL=%2F';

    const result = passwordResetEmail({
      name: 'Avery',
      resetUrl,
    });

    expect(result.subject).toBe('Reset your Heart Lines password');
    expect(result.html).toContain(resetUrl);
    expect(result.text).toContain(resetUrl);
    expect(result.html).toContain('Avery');
    expect(result.text).toContain('Avery');
  });

  it('escapes user-derived names in HTML', () => {
    const result = passwordResetEmail({
      name: '<script>alert("x")</script>',
      resetUrl: 'https://example.com/reset/token',
    });

    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
  });

  it('uses a neutral greeting when name is absent', () => {
    const result = passwordResetEmail({
      name: null,
      resetUrl: 'https://example.com/reset/token',
    });

    expect(result.text).toContain('Hi there');
  });
});
