// @polsia:user-owned — public legal placeholder pending review.

import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Privacy Policy — Heart Lines',
  description: 'Draft Heart Lines Privacy Policy placeholder pending legal review.',
};

export default function PrivacyPage() {
  return (
    <main className="section bg-background">
      <div className="container-page max-w-3xl">
        <Card className="border-border/70 bg-card shadow-brand">
          <CardHeader>
            <p className="text-eyebrow text-brand-700">Draft — legal review required</p>
            <CardTitle className="mt-3 text-h2">Privacy Policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-body text-muted-foreground">
            <p>This page is a neutral placeholder for the Heart Lines Privacy Policy.</p>
            <p>
              The final policy will be added after review. This draft is not the final policy and
              does not describe the practices that will apply to members.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
