// @polsia:user-owned — colored badge for the compatibility score.
'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-caption font-semibold tabular-nums',
  {
    variants: {
      bucket: {
        high: 'border-brand-200 bg-brand-100 text-brand-800 dark:border-brand-700 dark:bg-brand-900/40 dark:text-brand-100',
        medium: 'border-border bg-secondary text-secondary-foreground',
        low: 'border-border bg-muted text-muted-foreground',
      },
    },
    defaultVariants: { bucket: 'low' },
  },
);

type VariantType = NonNullable<VariantProps<typeof badgeVariants>['bucket']>;

export interface MatchScoreBadgeProps {
  score: number;
  className?: string;
}

export function MatchScoreBadge({ score, className }: MatchScoreBadgeProps) {
  const bucket: VariantType = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  return (
    <span className={cn(badgeVariants({ bucket }), className)}>
      <span aria-hidden="true" className="text-base leading-none">
        {bucket === 'high' ? '✦' : '◆'}
      </span>
      {score}% match
    </span>
  );
}
