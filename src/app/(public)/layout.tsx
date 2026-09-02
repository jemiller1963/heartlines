// @polsia:user-owned — public marketing shell.

import type { ReactNode } from 'react';
import { SiteFooter, SiteNav } from '@/components/custom/site-nav';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteNav enabled />
      {children}
      <SiteFooter enabled />
    </>
  );
}
