'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, CalendarDays, Upload, Wallet, FileText } from 'lucide-react';

const navItems = [
  { href: '/today', label: 'Today', icon: Calendar },
  { href: '/event', label: 'Event', icon: CalendarDays },
  { href: '/import', label: 'Import', icon: Upload },
  { href: '/wallet', label: 'Wallet', icon: Wallet },
  { href: '/recap', label: 'Recap', icon: FileText },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[420px] border-t border-border bg-background/95 backdrop-blur-sm z-50">
      <ul className="flex items-center justify-around h-16 px-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`flex flex-col items-center justify-center gap-1 py-2 transition-colors ${
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                <span className="text-[10px] font-medium leading-none">
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
