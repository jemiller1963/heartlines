// @polsia:user-owned — shared zod contract for the matching-feed compatibility
// resource. Imported by client + handler.
//
// Reuses UserId from `@/lib/contracts/swipe` so id-shape validation has a
// single source of truth; the value rules (`min(1).max(64)`) are inherited.
// Keep client-importable: zod only — no server-only imports.

import { z } from 'zod';
import { UserId } from '@/lib/contracts/swipe';

export const CompatibilityAxis = z.object({
  score: z.number().min(0).max(1),
  shared: z.array(z.string()),
  divergent: z.array(z.string()),
});
export type CompatibilityAxis = z.infer<typeof CompatibilityAxis>;

export const CompatibilityQuery = z.object({
  with: UserId,
});
export type CompatibilityQuery = z.infer<typeof CompatibilityQuery>;

export const CompatibilityResult = z.object({
  viewerUserId: UserId,
  targetUserId: UserId,
  values: CompatibilityAxis,
  interests: CompatibilityAxis,
  lifestyle: CompatibilityAxis,
  overall: z.number().min(0).max(1),
});
export type CompatibilityResult = z.infer<typeof CompatibilityResult>;
