// @polsia:user-owned
'use client';

import {
  Ban,
  CalendarDays,
  CreditCard,
  Heart,
  IdCard,
  type LucideIcon,
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
  href: string;
  label: string;
  icon: LucideIcon;
  match: 'exact' | 'starts';
}

const primaryItems: NavItem[] = [
  { href: '/feed', label: 'Matches', icon: Heart, match: 'starts' },
  { href: '/messages', label: 'Messages', icon: Mail, match: 'starts' },
  { href: '/events', label: 'Events', icon: CalendarDays, match: 'starts' },
  { href: '/profile', label: 'Profile', icon: User, match: 'starts' },
];

const secondaryItems: NavItem[] = [
  {
    href: '/video-sessions',
    label: 'Video Dates',
    icon: Video,
    match: 'starts',
  },
  { href: '/profile/edit', label: 'Edit profile', icon: User, match: 'starts' },
  {
    href: '/settings/privacy',
    label: 'Privacy',
    icon: ShieldCheck,
    match: 'starts',
  },
  {
    href: '/settings/blocks',
    label: 'Blocked members',
    icon: Ban,
    match: 'starts',
  },
  {
    href: '/pricing',
    label: 'Subscription / Pricing',
    icon: CreditCard,
    match: 'exact',
  },
  { href: '/settings/account', label: 'Account', icon: User, match: 'starts' },
  {
    href: '/support',
    label: 'Safety & Support',
    icon: ShieldCheck,
    match: 'exact',
  },
];

const adminItems: NavItem[] = [
  {
    href: '/admin/profiles',
    label: 'Profile review',
    icon: ShieldCheck,
    match: 'starts',
  },
  {
    href: '/admin/verifications',
    label: 'ID Review',
    icon: IdCard,
    match: 'starts',
  },
  {
    href: '/admin/users',
    label: 'Users',
    icon: Users,
    match: 'starts',
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

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active =
      item.match === 'starts'
        ? pathname === item.href || pathname.startsWith(`${item.href}/`)
        : pathname === item.href;

    return (
      <Link
        key={item.href}
        href={item.href}
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
  };

  return (
    <nav aria-label="Member navigation" className="flex flex-col gap-6">
      <div className="flex gap-2 overflow-x-auto lg:grid lg:overflow-visible">
        {primaryItems.map(renderItem)}
      </div>
      <div className="flex flex-col gap-1 border-t border-border/70 pt-4">
        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          More
        </p>
        {secondaryItems.map(renderItem)}
      </div>
      {isAdmin && (
        <div className="flex flex-col gap-1 border-t border-border/70 pt-4">
          <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Admin
          </p>
          {adminItems.map(renderItem)}
        </div>
      )}
    </nav>
  );
}
