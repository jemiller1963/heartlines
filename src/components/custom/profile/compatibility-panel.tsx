// @polsia:user-owned — compatibility breakdown island for /profile/[id].
//
// On mount, once the dashboard shell has the viewer session mounted, this
// pulls /api/profile/compatibility for the displayed profile's userId and
// renders four labeled score rows (Values / Interests / Lifestyle / Overall).
// The route handler short-circuits on 401 (auth lost mid-flight), 403 (self-
// target), and 404 (no target profile) — the panel mirrors that and renders
// `null`. An axis with no `shared`/`divergent` content and a zero score
// renders a soft "Not enough info yet" line in place of the bar.
//
// Data plane: this island must NOT import server-only modules (Db, Prisma,
// server-only, next/headers). biome's `noRestrictedImports` hard-rejects
// those in a client file; the only correct path is data via apiFetch.

'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { apiFetch } from '@/lib/api-client';
import {
  type CompatibilityAxis,
  type CompatibilityResult,
  CompatibilityResult as CompatibilityResultSchema,
} from '@/lib/contracts/compatibility';
import { useMountedSession } from '@/lib/use-auth-session';

interface CompatibilityPanelProps {
  targetUserId: string;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'hidden' } // 401/403/404 OR a payload with nothing meaningful across all axes
  | { kind: 'ready'; result: CompatibilityResult }
  | { kind: 'error'; message: string };

function isAxisEmpty(axis: CompatibilityAxis): boolean {
  return axis.score === 0 && axis.shared.length === 0 && axis.divergent.length === 0;
}

function isResultEffectivelyEmpty(result: CompatibilityResult): boolean {
  return (
    isAxisEmpty(result.values) && isAxisEmpty(result.interests) && isAxisEmpty(result.lifestyle)
  );
}

function extractStatus(err: unknown): string | undefined {
  return (err as Error).message?.match(/\((\d{3})\)/)?.[1];
}

interface ScoreRowProps {
  name: string;
  axis: CompatibilityAxis;
}

function ScoreRow({ name, axis }: ScoreRowProps) {
  if (isAxisEmpty(axis)) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-eyebrow text-muted-foreground">{name}</p>
        <p className="text-caption italic text-muted-foreground">Not enough info yet</p>
      </div>
    );
  }

  const pct = Math.round(axis.score * 100);
  const visibleShared = axis.shared.slice(0, 5);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-eyebrow text-muted-foreground">{name}</p>
        <p className="text-caption font-semibold tabular-nums text-foreground">{pct}%</p>
      </div>
      <Progress value={pct} aria-label={`${name} compatibility`} />
      {visibleShared.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {visibleShared.map((token) => (
            <li
              key={token}
              className="inline-flex items-center rounded-full border border-brand-200 bg-brand-50 px-2.5 py-0.5 text-caption font-medium text-brand-800 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-100"
            >
              {token}
            </li>
          ))}
          {axis.shared.length > visibleShared.length ? (
            <li className="text-caption text-muted-foreground">
              +{axis.shared.length - visibleShared.length} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function OverallRow({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-eyebrow text-foreground">Overall</p>
        <p className="text-caption font-semibold tabular-nums text-foreground">{pct}%</p>
      </div>
      <Progress value={pct} aria-label="Overall compatibility" />
    </div>
  );
}

export function CompatibilityPanel({ targetUserId }: CompatibilityPanelProps) {
  const { data: session, isPending: sessionPending } = useMountedSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    // Wait for the dashboard shell to hydrate the session so we don't
    // race the auth check (the route handler returns 401 if the cookie
    // isn't there yet, but DashboardShell owns the auth-redirect seam).
    if (sessionPending) return;
    if (!session?.user) return;

    let cancelled = false;
    setState({ kind: 'loading' });

    void (async () => {
      try {
        const result = await apiFetch<CompatibilityResult>(
          `/api/profile/compatibility?with=${encodeURIComponent(targetUserId)}`,
          { method: 'GET', schema: CompatibilityResultSchema },
        );
        if (cancelled) return;
        // "pending target" → server returns a payload with zero-axis
        // scores and no shared/divergent content. The handler can't
        // tell us it's a pending user, so we fold the hide into the
        // panel: an empty-result payload renders nothing rather than
        // a card full of zeroes.
        if (isResultEffectivelyEmpty(result)) {
          setState({ kind: 'hidden' });
          return;
        }
        setState({ kind: 'ready', result });
      } catch (err) {
        if (cancelled) return;
        const status = extractStatus(err);
        if (status === '401' || status === '403' || status === '404') {
          setState({ kind: 'hidden' });
          return;
        }
        const message = err instanceof Error ? err.message : 'Unable to load compatibility.';
        setState({ kind: 'error', message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [targetUserId, sessionPending, session?.user]);

  if (state.kind === 'loading' || state.kind === 'hidden') return null;

  if (state.kind === 'error') {
    return (
      <Card className="border-border/70 bg-card shadow-sm" role="alert">
        <CardHeader>
          <CardTitle className="text-h4">Compatibility break­down</CardTitle>
          <CardDescription>Couldn&apos;t load the compatibility score right now.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-body text-muted-foreground">{state.message}</p>
          <button
            type="button"
            className="self-start text-caption font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-200"
            onClick={() => {
              // Remount-key the effect by re-running load when clicked.
              setState({ kind: 'loading' });
              if (session?.user) {
                void apiFetch<CompatibilityResult>(
                  `/api/profile/compatibility?with=${encodeURIComponent(targetUserId)}`,
                  { method: 'GET', schema: CompatibilityResultSchema },
                )
                  .then((result) => {
                    if (isResultEffectivelyEmpty(result)) {
                      setState({ kind: 'hidden' });
                    } else {
                      setState({ kind: 'ready', result });
                    }
                  })
                  .catch((err: unknown) => {
                    const status = extractStatus(err);
                    if (status === '401' || status === '403' || status === '404') {
                      setState({ kind: 'hidden' });
                      return;
                    }
                    setState({
                      kind: 'error',
                      message: err instanceof Error ? err.message : 'Unable to load compatibility.',
                    });
                  });
              }
            }}
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader>
        <CardTitle className="text-h4">Compatibility break­down</CardTitle>
        <CardDescription>
          How you and this member align across values, interests, and lifestyle.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ScoreRow name="Values" axis={state.result.values} />
        <ScoreRow name="Interests" axis={state.result.interests} />
        <ScoreRow name="Lifestyle" axis={state.result.lifestyle} />
        <OverallRow value={state.result.overall} />
      </CardContent>
    </Card>
  );
}
