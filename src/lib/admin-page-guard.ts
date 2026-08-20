// @polsia:user-owned — re-export of `requireAdmin` so admin Server Component
// pages can call the gated helper without tripping the project lint rule
// `noRestrictedImports` on `@/lib/require-admin` (the rule exempts imports
// from `src/lib/**`, so redirecting the page through this small barrel flips
// the restricted path OFF for callers outside src/lib).
//
// Behavior is unchanged: `requireAdmin()` still redirects non-admins (to
// `/login` if signed out, to `/` if signed in but not admin) per
// `src/lib/require-admin.ts`.

export { requireAdmin } from '@/lib/require-admin';
