// @polsia:user-owned — public legal placeholder pending review.

import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Terms of Service — Heart Lines',
  description: 'Draft Heart Lines Terms of Service placeholder pending legal review.',
};

export default function TermsPage() {
  return (
    <main className="section bg-background">
      <div className="container-page max-w-3xl">
        <Card className="border-border/70 bg-card shadow-brand">
          <CardHeader>
            <p className="text-eyebrow text-brand-700">Draft — legal review required</p>
            <CardTitle className="mt-3 text-h2">Terms of Service</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-body text-muted-foreground">
            <p>This page is a neutral placeholder for the Heart Lines Terms of Service.</p>
            <p>
              The final terms will be added after review. This draft is not the final agreement and
              does not describe the terms that will apply to members.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
