"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type MenuItem = {
  id: string;
  href: string;
  label: string;
  matches: (pathname: string) => boolean;
  children?: Array<{ href: string; label: string }>;
};

const BASE_MENU: MenuItem[] = [
  {
    id: "dashboard",
    href: "/staff/dashboard",
    label: "Dashboard",
    matches: (pathname) => pathname.startsWith("/staff/dashboard")
  },
  {
    id: "all-contacts",
    href: "/staff/contacts",
    label: "All Contacts",
    matches: (pathname) =>
      pathname.startsWith("/staff/contacts") ||
      pathname.startsWith("/staff/donors") ||
      pathname.startsWith("/staff/donor-organizations") ||
      pathname.startsWith("/staff/organizations"),
    children: [
      { href: "/staff/donors", label: "Donors" },
      { href: "/staff/contacts/personal", label: "Contacts" },
      { href: "/staff/donor-organizations", label: "Donor Organizations" },
      { href: "/staff/organizations", label: "Organizations" }
    ]
  },
  {
    id: "financial",
    href: "/staff/financial",
    label: "Financial",
    matches: (pathname) =>
      pathname.startsWith("/staff/financial") ||
      pathname.startsWith("/staff/donations") ||
      pathname.startsWith("/staff/campaigns"),
    children: [
      { href: "/staff/financial/campaigns", label: "Campaigns" },
      { href: "/staff/financial/donations", label: "Donations" }
    ]
  },
  {
    id: "projects",
    href: "/staff/projects",
    label: "Projects",
    matches: (pathname) => pathname.startsWith("/staff/projects") || pathname.startsWith("/staff/tasks"),
    children: [
      { href: "/staff/projects/management", label: "Project Management" },
      { href: "/staff/tasks", label: "Tasks" }
    ]
  },
  {
    id: "memberships",
    href: "/staff/memberships",
    label: "Memberships",
    matches: (pathname) => pathname.startsWith("/staff/memberships")
  },
  {
    id: "administration",
    href: "/staff/admin/users",
    label: "Administration",
    matches: (pathname) => pathname.startsWith("/staff/admin"),
    children: [
      { href: "/staff/admin/users", label: "Users" },
      { href: "/staff/admin/roles", label: "Roles" },
      { href: "/staff/admin/tags", label: "Tags" },
      { href: "/staff/admin/contacts/merge", label: "Contact Merge" },
      { href: "/staff/admin/integrations", label: "Integrations" }
    ]
  }
];

export function StaffSidebar({
  canAccessImportCenter
}: {
  canAccessImportCenter?: boolean;
}) {
  const pathname = usePathname();
  const menu = [
    ...BASE_MENU,
    ...(canAccessImportCenter
      ? ([
          {
            id: "import-center",
            href: "/staff/import-center",
            label: "Import Center",
            matches: (path: string) => path.startsWith("/staff/import-center"),
            children: [{ href: "/staff/import-center/contacts", label: "Contacts Import" }]
          } satisfies MenuItem
        ] as MenuItem[])
      : [])
  ];

  return (
    <aside className="sticky top-0 h-screen w-64 border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-8">
        <Link href="/staff/dashboard" className="block">
          <Image
            src="/HerdCoreLogo.png"
            alt="HerdCore"
            width={220}
            height={72}
            className="h-auto w-full max-w-[220px]"
            priority
          />
        </Link>
      </div>
      <nav className="space-y-1">
        {menu.map((item) => {
          const isActive = item.matches(pathname);
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
              {isActive && item.children ? (
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
