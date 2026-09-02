// @polsia:user-owned — minimal Safety & Support destination.

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Safety & Support — Heart Lines',
  description: 'Find safety guidance and contact Heart Lines support.',
};

export default function SupportPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-eyebrow text-brand-600">Safety & Support</p>
      <h1 className="text-h1 font-bold text-foreground">We are here to help.</h1>
      <p className="text-body-lg text-muted-foreground">
        Support resources are being prepared. For help with your account or a safety concern, email
        heart-lines@polsia.app.
      </p>
    </div>
  );
}
