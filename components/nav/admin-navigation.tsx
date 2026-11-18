"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const LINKS = [
  { href: "/admin", label: "Sunday" },
  { href: "/admin/players", label: "Players" },
  { href: "/admin/attendance", label: "Attendance" },
  { href: "/admin/feed", label: "Feed" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/home", label: "Player view" },
];

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Admin" className="sticky top-0 z-30 border-b border-pitch-800 bg-pitch-950/95 backdrop-blur">
      <ul className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 py-2">
        {LINKS.map((link) => {
          const active = link.href === "/admin" ? pathname === "/admin" || pathname.startsWith("/admin/session") : pathname.startsWith(link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold whitespace-nowrap
                  ${active ? "bg-pitch-800 text-lime" : "text-chalk-faint hover:text-chalk"}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
        <li className="ml-auto pl-2">
          <ThemeToggle />
        </li>
      </ul>
    </nav>
  );
}
