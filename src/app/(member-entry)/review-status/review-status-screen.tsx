// @polsia:user-owned — generic review status client island.

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function ReviewStatusScreen() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 py-8">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow">Heart Lines</p>
        <h1 className="text-h2 text-foreground">We’re reviewing your profile</h1>
        <p className="text-body text-muted-foreground">
          Thanks for joining Heart Lines. Your profile is in the review process, and we’ll let you
          know when your member area is ready.
        </p>
      </div>
      <Card className="border-brand-200/70 bg-card shadow-brand dark:border-brand-800/70">
        <CardHeader>
          <CardTitle className="text-h4">You’re all set for now</CardTitle>
          <CardDescription>
            There’s nothing else you need to do while we take a look.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Please check back soon for your next step.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
