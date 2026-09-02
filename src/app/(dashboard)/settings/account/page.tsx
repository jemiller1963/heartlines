import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Account — Heart Lines',
};

export default function AccountPage() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-eyebrow text-brand-600">Account</p>
      <h1 className="text-h1 font-bold text-foreground">Account settings</h1>
      <p className="text-body-lg text-muted-foreground">
        Additional account settings will be available here.
      </p>
    </div>
  );
}
