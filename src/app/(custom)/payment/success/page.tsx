// @polsia:user-owned — `/payment/success` polled-verification page. Stripe
// redirects back here with `?session_id=...`; we poll
// `/api/stripe-billing/verify?session_id=...` (the module-owned owner-route)
// until it reports `verified: true`, then the user sees a confirmation and
// navigates to the conversation page. We bound the polling window so a
// genuinely broken checkout lands gracefully instead of spinning.

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PaymentSuccessClient } from './payment-success-client';

export const metadata: Metadata = {
  title: 'Payment received — Heart Lines',
  description: 'Confirming your Heart Lines Premium subscription.',
  // Don't index this page — it's an ephemeral receipt.
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
