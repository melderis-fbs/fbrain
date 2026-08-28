'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@/lib/ui';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: number;
  badgeTone?: 'critical' | 'serious' | 'neutral';
}

export function Nav({ groups }: { groups: { title?: string; items: NavItem[] }[] }) {
  const path = usePathname();
  return (
    <nav className="space-y-5">
      {groups.map((g, i) => (
        <div key={i}>
          {g.title && (
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-3">
              {g.title}
            </div>
          )}
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = path === item.href || path.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cx(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition',
                      active
                        ? 'bg-accent-soft font-semibold text-accent-ink'
                        : 'text-ink-2 hover:bg-surface-2',
                    )}
                  >
                    <span aria-hidden className="w-4 text-center text-[13px]">
                      {item.icon}
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span
                        className="tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background:
                            item.badgeTone === 'critical'
                              ? 'var(--critical-soft)'
                              : item.badgeTone === 'serious'
                                ? 'var(--serious-soft)'
                                : 'var(--surface-2)',
                          color:
                            item.badgeTone === 'critical'
                              ? 'var(--critical-ink)'
                              : item.badgeTone === 'serious'
                                ? 'var(--serious-ink)'
                                : 'var(--ink-2)',
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
