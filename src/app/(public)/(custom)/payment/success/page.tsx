// @polsia:user-owned — payment receipt page.

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentSuccessClient } from './payment-success-client';

export const metadata: Metadata = {
  title: 'Payment received — Heart Lines',
  description: 'Confirming your Heart Lines Premium subscription.',
  robots: { index: false, follow: false },
};

export default function PaymentSuccessPage() {
  return (
    <main className="bg-background text-foreground">
      <section className="section">
        <div className="container-page mx-auto flex max-w-xl flex-col items-center gap-6 text-center">
          <Suspense fallback={null}>
            <PaymentSuccessClient />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
