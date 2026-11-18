"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Item {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Number shown on the icon when there is something waiting. */
  badge?: number;
}

const ICON = "size-6";

function HomeIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.5V20h14V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TeamsIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" strokeLinecap="round" />
      <path d="M16 14.5c2.8.3 5 2.2 5 4.5" strokeLinecap="round" />
    </svg>
  );
}

function FeedIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M5 4h14v16H5z" strokeLinejoin="round" />
      <path d="M8.5 9h7M8.5 13h7M8.5 17h4" strokeLinecap="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" strokeLinejoin="round" />
      <path d="M10 20.5a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" strokeLinecap="round" />
    </svg>
  );
}

function AdminIcon() {
  return (
    <svg className={ICON} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 3 4 6.5v5c0 4.6 3.3 8.5 8 9.5 4.7-1 8-4.9 8-9.5v-5L12 3Z" strokeLinejoin="round" />
    </svg>
  );
}

export function BottomNavigation({ isAdmin, notificationCount = 0 }: { isAdmin: boolean; notificationCount?: number }) {
  const pathname = usePathname();

  const items: Item[] = [
    { href: "/home", label: "Home", icon: <HomeIcon /> },
    { href: "/teams", label: "Teams", icon: <TeamsIcon /> },
    { href: "/feed", label: "Feed", icon: <FeedIcon /> },
    { href: "/notifications", label: "Alerts", icon: <BellIcon />, badge: notificationCount },
    { href: "/profile", label: "Profile", icon: <ProfileIcon /> },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: <AdminIcon /> }] : []),
  ];

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-pitch-700 bg-pitch-900/95 backdrop-blur
        pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.badge ? `${item.label}, ${item.badge} waiting` : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold
                  ${active ? "text-lime" : "text-chalk-faint"}`}
              >
                <span className="relative">
                  {item.icon}
                  {item.badge ? (
                    <span
                      aria-hidden
                      className="tabular absolute -right-2 -top-1.5 flex min-w-4 items-center justify-center rounded-full
                        bg-kit-red px-1 text-[10px] font-black leading-4 text-white"
                    >
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
