// scripts/smoke-messages-threads.mjs
//
// Live-deploy smoke for GET /api/messages/threads.
//
// NOT part of `npm test` and NOT a CI gate — a developer-runnable check
// against a running `next dev` (or `next start`) on PORT=3000 with the
// messages schema applied (`npx prisma db push`).
//
// Asserts the brief's two live requirements:
//   1.  Unauth GET → 401.
//   2.  Fresh authed user (just signed up via the better-auth endpoint) →
//       200 with `{ items: [] }`.
//
// The deeper seed-a-thread-and-read-back flow is exercised by the unit
// tests; this script keeps things HTTP-only so it doesn't have to import
// `@prisma/client` (which the biome `noRestrictedImports` rule forbids from
// non-`src/lib/**` files). If a richer "shape the live route returns a
// populated thread" check is needed later, do it via a dedicated test
// endpoint or a sibling seed route handler — NOT by importing the prisma
// client here.
//
// Usage:
//   node scripts/smoke-messages-threads.mjs
// or with the project's existing `.env`:
//   node --env-file=.env scripts/smoke-messages-threads.mjs
//
// Requires a live server on SMOKE_BASE_URL (default http://localhost:3000).

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
// better-auth rejects sign-up / sign-in with a 403 unless the `Origin`
// header matches one of its `trustedOrigins`. The dev localhost URL isn't
// trusted by default, so we spoof the Origin to one of the configured
// trusted URLs (taken from authConfig.trustedOrigins / polsia.toml). The
// Set-Cookie is domain-less and jarred onto whatever host the actual
// response comes back from, so the cookie still binds to localhost.
const SMOKE_ORIGIN = process.env.SMOKE_ORIGIN ?? 'https://heart-lines.polsia.app';
const RUN = `${Date.now()}-${process.pid}`;
const EMAIL = `messages-smoke-${RUN}@example.test`;
const NAME = 'Messages Smoke';
const PASSWORD = 'smoke-password-12345';

const SMOKE = (msg) => process.stderr.write(`SMOKE: ${msg}\n`);
const SMOKE_OK = (msg) => process.stderr.write(`SMOKE OK: ${msg}\n`);
const SMOKE_FAIL = (msg) => process.stderr.write(`SMOKE FAIL: ${msg}\n`);

function assert(cond, msg) {
  if (!cond) {
    SMOKE_FAIL(msg);
    throw new Error(msg);
  }
  SMOKE_OK(msg);
}

async function signUp(email) {
  const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SMOKE_ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD, name: NAME }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    SMOKE_FAIL(`sign-up for ${email} failed (${res.status}): ${text}`);
    throw new Error('sign-up failed');
  }
  const body = await res.json();
  if (!body?.user?.id) {
    throw new Error('sign-up did not return a user id');
  }
  return body.user.id;
}

async function signIn(email) {
  const res = await fetch(`${BASE}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SMOKE_ORIGIN },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    SMOKE_FAIL(`sign-in for ${email} failed (${res.status}): ${text}`);
    throw new Error('sign-in failed');
  }
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length === 0) {
    throw new Error('sign-in did not return a Set-Cookie header');
  }
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  SMOKE(`run=${RUN}, base=${BASE}`);

  // 1. Unauth GET → 401.
  const unauth = await fetch(`${BASE}/api/messages/threads`);
  assert(unauth.status === 401, `unauth GET /api/messages/threads → 401 (got ${unauth.status})`);

  // 2. Sign-up a fresh user (so the route has a session to bind to).
  //    The fresh user has zero threads → the route must return 200 with
  //    the empty-item envelope.
  const userId = await signUp(EMAIL);
  assert(typeof userId === 'string' && userId.length > 0, `sign-up returned user id ${userId}`);

  const cookie = await signIn(EMAIL);
  assert(cookie.length > 0, 'sign-in returned a session cookie');

  const authed = await fetch(`${BASE}/api/messages/threads`, { headers: { cookie } });
  assert(authed.status === 200, `authed GET → 200 (got ${authed.status})`);
  const body = await authed.json();
  assert(Array.isArray(body.items), `body.items is an array (got ${typeof body.items})`);
  assert(body.items.length === 0, `fresh authed user has zero threads (got ${body.items.length})`);

  SMOKE('all asserts passed');
}

try {
  await main();
} catch (err) {
  SMOKE_FAIL(`error → ${err.message}`);
  process.exit(1);
}

SMOKE('complete');
