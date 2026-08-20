// @polsia:user-owned — deploy-time database seed. You OWN this file.
//
// seed() runs once when the server boots (via the framework-owned
// src/instrumentation.ts), on the Node server, AFTER the schema is applied. Use it
// for reference/lookup data your app needs to exist BEFORE the first request:
// plans, categories, feature defaults, a first admin row, etc. Read/write the DB
// through the Prisma singleton in @/lib/db (server startup — there is no request,
// so this does NOT go through /api).
//
// RULES — this runs on EVERY deploy/boot, possibly more than once, possibly on more
// than one instance at the same time:
//   1. Make every write IDEMPOTENT — upsert (`where` + `create` + `update`) or
//      `createMany({ ..., skipDuplicates: true })`, NEVER a bare `create`/`insert`.
//   2. Keep it fast and small — it runs before the server serves traffic.
//   3. NOT for recurring work (that's polsia.toml `[[crons]]`) or per-user/
//      request-time logic (that's an /api route handler). There is no request here.
//
// The template ships an empty seed (a no-op). Fill in the body when your app needs
// it; leave it empty to keep seeding off. Don't delete the file — instrumentation.ts
// imports it.
export async function seed(): Promise<void> {
  const { prisma } = await import('@/lib/db');
  const now = new Date();
  const ADMIN_EMAILS = ['inked2gether@yahoo.com', 'jemiller1963@gmail.com'];
  for (const email of ADMIN_EMAILS) {
    const lower = email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: lower } });
    if (existing) {
      if (existing.role !== 'admin') {
        await prisma.user.update({
          where: { id: existing.id },
          data: { role: 'admin', updatedAt: now },
        });
      }
      continue;
    }
    await prisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email: lower,
        name: lower.split('@')[0] ?? lower,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
        role: 'admin',
      },
    });
  }
}
