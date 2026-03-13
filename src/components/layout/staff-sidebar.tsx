"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/staff/dashboard", label: "Dashboard" },
  { href: "/staff/contacts", label: "Contacts" },
  { href: "/staff/donations", label: "Donations" },
  { href: "/staff/memberships", label: "Memberships" },
  { href: "/staff/tasks", label: "Tasks" },
  { href: "/staff/imports", label: "Imports" },
  { href: "/staff/reports", label: "Reporting" },
  { href: "/staff/admin/users", label: "Users" },
  { href: "/staff/admin/roles", label: "Roles" },
  { href: "/staff/admin/settings", label: "Organization" },
  { href: "/staff/audit", label: "Audit Log" }
];

export function StaffSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 h-screen w-64 border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          NonprofitCRM
        </p>
        <h2 className="text-lg font-semibold text-slate-900">Staff Console</h2>
      </div>
      <nav className="space-y-1">
        {items.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition",
                isActive
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-700 hover:bg-slate-100"
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
