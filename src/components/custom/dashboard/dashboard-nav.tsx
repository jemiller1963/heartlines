// @polsia:user-owned
'use client';

import {
  Ban,
  CalendarDays,
  CreditCard,
  IdCard,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  User,
  Users,
  Video,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMountedSession } from '@/lib/use-auth-session';
import { cn } from '@/lib/utils';

interface NavItem {
  href: (session: { id: string } | null) => string;
  label: string;
  icon: typeof LayoutDashboard;
  match: 'exact' | 'starts';
  adminOnly?: boolean;
}

const navItems: NavItem[] = [
  {
    href: () => '/dashboard',
    label: 'Overview',
    icon: LayoutDashboard,
    match: 'exact',
  },
  {
    href: (session) => (session ? `/profile/${session.id}` : '/profile'),
    label: 'Profile',
    icon: User,
    match: 'starts',
  },
  {
    href: () => '/events',
    label: 'Events',
    icon: CalendarDays,
    match: 'exact',
  },
  {
    href: () => '/video-sessions',
    label: 'Video dates',
    icon: Video,
    match: 'starts',
  },
  {
    href: () => '/messages',
    label: 'Messages',
    icon: Mail,
    match: 'starts',
  },
  {
    href: () => '/settings/privacy',
    label: 'Privacy',
    icon: ShieldCheck,
    match: 'starts',
  },
  {
    href: () => '/settings/blocks',
    label: 'Blocked',
    icon: Ban,
    match: 'starts',
  },
  {
    href: () => '/pricing',
    label: 'Pricing',
    icon: CreditCard,
    match: 'exact',
  },
  {
    href: () => '/admin/verifications',
    label: 'ID Review',
    icon: IdCard,
    match: 'starts',
    adminOnly: true,
  },
  {
    href: () => '/admin/profiles',
    label: 'Profiles',
    icon: ShieldCheck,
    match: 'starts',
    adminOnly: true,
  },
  {
    href: () => '/admin/users',
    label: 'Users',
    icon: Users,
    match: 'starts',
    adminOnly: true,
  },
];

function hasRole(role: string | null | undefined, expected: string) {
  return (
    role
      ?.split(',')
      .map((item) => item.trim())
      .includes(expected) ?? false
  );
}

export function DashboardNav() {
  const pathname = usePathname();
  const { data: session } = useMountedSession();
  const isAdmin = hasRole(session?.user?.role, 'admin');

  return (
    <nav
      aria-label="Dashboard"
      className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0"
    >
      {navItems
        .filter((item) => !item.adminOnly || isAdmin)
        .map((item) => {
          const Icon = item.icon;
          const linkHref = item.href(session?.user ?? null);
          const active =
            item.match === 'starts' ? pathname.startsWith(linkHref) : pathname === linkHref;

          return (
            <Link
              key={item.label}
              href={linkHref}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors',
                active
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
              )}
            >
              <Icon aria-hidden="true" className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
    </nav>
  );
}
