// @vitest-environment node
// @polsia:user-owned — focused Epic 4 signup regression coverage.

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const source = (file: string) => readFileSync(path.join(root, file), 'utf8');

const signup = source('src/components/custom/sign-up-form.tsx');
const signupPage = source('src/app/(public)/(auth)/signup/page.tsx');

describe('Epic 4 trustworthy 50+ signup', () => {
  it('requires age eligibility and the combined Terms/Privacy acknowledgement', () => {
    expect(signup).toContain('id="sign-up-age-confirmation"');
    expect(signup).toContain('I confirm I am at least 50 years old');
    expect(signup).toMatch(/id="sign-up-age-confirmation"[\s\S]*?required/);
    expect(signup).toContain('id="sign-up-terms-confirmation"');
    expect(signup).toMatch(/id="sign-up-terms-confirmation"[\s\S]*?required/);
    expect(signup).toContain('href="/terms"');
    expect(signup).toContain('href="/privacy"');
    expect(signup).toContain('Terms of Service');
    expect(signup).toContain('Privacy Policy');
  });

  it('keeps password guidance, HTML limits, and Better Auth config aligned', () => {
    expect(signup).toContain('const MIN_PASSWORD_LENGTH = 8');
    expect(signup).toContain('const MAX_PASSWORD_LENGTH = 128');
    expect(signup).toContain('minLength={MIN_PASSWORD_LENGTH}');
    expect(signup).toContain('maxLength={MAX_PASSWORD_LENGTH}');
    expect(signup).toContain('8–128 characters');
    const authConfig = source('src/lib/auth-config.ts');
    expect(authConfig).toContain('minPasswordLength: 8');
    expect(authConfig).toContain('maxPasswordLength: 128');
  });

  it('routes successful signup directly to onboarding', () => {
    expect(signup).toContain("router.replace('/onboarding')");
    expect(signup).not.toContain("router.replace('/')");
    expect(signup).not.toContain("router.replace('/dashboard')");
    expect(signup).not.toContain("router.replace('/feed')");
  });

  it('preserves the public shell and adds public legal destinations', () => {
    const publicLayout = source('src/app/(public)/layout.tsx');
    expect(publicLayout).toContain('<SiteNav enabled />');
    expect(publicLayout).toContain('<SiteFooter enabled />');
    expect(signupPage).toContain('export const metadata: Metadata');
    expect(signupPage).toContain('<SignUpForm />');
    expect(existsSync(path.join(root, 'src/app/(public)/terms/page.tsx'))).toBe(true);
    expect(existsSync(path.join(root, 'src/app/(public)/privacy/page.tsx'))).toBe(true);
    expect(source('src/app/(public)/terms/page.tsx')).toContain('Draft — legal review required');
    expect(source('src/app/(public)/privacy/page.tsx')).toContain('Draft — legal review required');
  });

  it('does not collect profile age/data or cross the server boundary in signup', () => {
    expect(signup).not.toContain('name="age"');
    expect(signup).toContain('name: name.trim()');
    expect(signup).toContain('email: email.trim()');
    expect(signup).not.toContain('/api/profile');
    expect(signup).not.toMatch(/@\/lib\/(db|require-admin|require-auth)(['"]|$)/);
    expect(signup).not.toContain("'use server'");
  });
});

describe('Epic 1 eligibility authority remains server-side', () => {
  it('keeps the 50+ profile contract and approved discovery filters', () => {
    const profileContract = source('src/lib/contracts/profile.ts');
    const discovery = source('src/lib/business/discovery-candidates.ts');
    expect(profileContract).toContain('.min(50');
    expect(discovery).toContain('age: { gte: 50 }');
    expect(discovery).toContain("reviewStatus: 'APPROVED'");
  });
});
