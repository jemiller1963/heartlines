// scripts/smoke-blocks.mjs
//
// Live-deploy smoke for POST /api/blocks.
//
// NOT part of `npm test` and NOT a CI gate — a developer-runnable check
// against a running `next dev` (or `next start`) on PORT=3000 with the
// blocks schema applied (`npx prisma db push`).
//
// Asserts the brief's three live requirements:
//   1.  Unauth POST → 401 (no cookie).
//   2.  Fresh authed user posts { toUserId: <not self> } → 200 + the Block
//       row summary, with `idempotent` absent from the JSON body.
//   3.  Identical second POST → 200 + `idempotent: true`, AND the response
//       body carries the SAME `id` as the first response (sanity-checks that
//       the unique index resolved the race and no duplicate row was written).
//
// HTTP-only: this script does NOT import `@prisma/client` (the biome
// `noRestrictedImports` rule forbids it from non-`src/lib/**` files).
//
// Usage:
//   node scripts/smoke-blocks.mjs
// or with the project's existing `.env`:
//   node --env-file=.env scripts/smoke-blocks.mjs
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
const EMAIL = `blocks-smoke-${RUN}@example.test`;
const NAME = 'Blocks Smoke';
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

async function postBlock(cookie, toUserId) {
  return fetch(`${BASE}/api/blocks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SMOKE_ORIGIN, cookie },
    body: JSON.stringify({ toUserId }),
  });
}

async function main() {
  SMOKE(`run=${RUN}, base=${BASE}`);

  // 1. Unauth POST → 401.
  const unauth = await fetch(`${BASE}/api/blocks`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SMOKE_ORIGIN },
    body: JSON.stringify({ toUserId: 'whatever' }),
  });
  assert(unauth.status === 401, `unauth POST /api/blocks → 401 (got ${unauth.status})`);
  const unauthBody = await unauth.json().catch(() => ({}));
  assert(
    unauthBody.error === 'Unauthorized',
    `unauth body parses to { error: 'Unauthorized' } (got ${JSON.stringify(unauthBody)})`,
  );

  // 2. Fresh sign-up → POST { toUserId: <not self> } → 200 + idempotent absent.
  const userId = await signUp(EMAIL);
  assert(typeof userId === 'string' && userId.length > 0, `sign-up returned user id ${userId}`);

  const cookie = await signIn(EMAIL);
  assert(cookie.length > 0, 'sign-in returned a session cookie');

  // Pick a synthetic target id that is definitely NOT the viewer. The brief
  // says blocks are allowed even when `blockedId` has no profile row, so
  // using an arbitrary string here is intentional — the brief's invariant
  // is that the handler does not look up the target's profile.
  const targetId = `target-${RUN}`;

  const first = await postBlock(cookie, targetId);
  assert(first.status === 200, `first POST → 200 (got ${first.status})`);
  const firstBody = await first.json();
  assert(typeof firstBody.id === 'string' && firstBody.id.length > 0, `first body has an id`);
  assert(firstBody.blockerId === userId, `first body.blockerId === viewer id`);
  assert(firstBody.blockedId === targetId, `first body.blockedId === target id`);
  assert(typeof firstBody.createdAt === 'string', `first body.createdAt is a string`);
  assert(
    !('idempotent' in firstBody),
    `first body has no 'idempotent' key (got keys: ${Object.keys(firstBody).join(',')})`,
  );

  // 3. Identical second POST → 200 + idempotent: true + SAME id (no duplicate).
  const second = await postBlock(cookie, targetId);
  assert(second.status === 200, `second POST → 200 (got ${second.status})`);
  const secondBody = await second.json();
  assert(secondBody.idempotent === true, `second body.idempotent === true`);
  assert(
    secondBody.id === firstBody.id,
    `second body.id matches first body.id (signals no duplicate row; got first=${firstBody.id}, second=${secondBody.id})`,
  );
  assert(secondBody.blockerId === userId, `second body.blockerId === viewer id`);
  assert(secondBody.blockedId === targetId, `second body.blockedId === target id`);

  SMOKE('all asserts passed');
}

try {
  await main();
} catch (err) {
  SMOKE_FAIL(`error → ${err.message}`);
  process.exit(1);
}

SMOKE('complete');
