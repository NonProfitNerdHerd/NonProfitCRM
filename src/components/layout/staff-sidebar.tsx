"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type MenuItem = {
  href: string;
  label: string;
  children?: Array<{ href: string; label: string }>;
};

const menu: MenuItem[] = [
  { href: "/staff/dashboard", label: "Dashboard" },
  { href: "/staff/contacts", label: "Contacts" },
  { href: "/staff/donations", label: "Donations" },
  { href: "/staff/campaigns", label: "Campaigns" },
  {
    href: "/staff/projects",
    label: "Projects",
    children: [{ href: "/staff/tasks", label: "Tasks" }]
  },
  { href: "/staff/memberships", label: "Memberships" },
  {
    href: "/staff/admin/users",
    label: "Administration",
    children: [
      { href: "/staff/admin/users", label: "Users" },
      { href: "/staff/admin/roles", label: "Roles" }
    ]
  },
  { href: "/staff/notifications", label: "Notifications" },
  { href: "/staff/organizations", label: "Organizations" },
  { href: "/staff/admin/settings", label: "Organization Settings" },
  { href: "/staff/audit", label: "Audit Log" },
  { href: "/staff/reports", label: "Reporting" },
  { href: "/staff/imports", label: "Imports" }
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
        {menu.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <div key={item.href}>
              <Link
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-700 hover:bg-slate-100"
                )}
                href={item.href}
              >
                {item.label}
              </Link>
              {item.children ? (
                <div className="ml-3 mt-1 space-y-1 border-l border-slate-200 pl-3">
                  {item.children.map((child) => {
                    const childActive = pathname.startsWith(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-xs font-medium transition",
                          childActive
                            ? "bg-brand-50 text-brand-700"
                            : "text-slate-600 hover:bg-slate-100"
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
