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
      { href: "/staff/donor-organizations", label: "Donor Organizations" },
      { href: "/staff/contacts/personal", label: "Contacts" },
      { href: "/staff/organizations", label: "Organizations" },
      { href: "/staff/contacts/mail-builder", label: "Mail Builder" }
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
      { href: "/staff/financial/donations", label: "Donations" },
      { href: "/staff/financial/campaigns", label: "Campaigns" }
    ]
  },
  {
    id: "projects",
    href: "/staff/projects",
    label: "Projects",
    matches: (pathname) => pathname.startsWith("/staff/projects") || pathname.startsWith("/staff/tasks"),
    children: [
      { href: "/staff/projects/management", label: "Project Management" },
      { href: "/staff/tasks", label: "My Tasks" }
    ]
  },
  {
    id: "memberships",
    href: "/staff/memberships",
    label: "Memberships",
    matches: (pathname) => pathname.startsWith("/staff/memberships")
  },
  {
    id: "reports",
    href: "/staff/reports/builder",
    label: "Reports",
    matches: (pathname) => pathname.startsWith("/staff/reports"),
    children: [
      { href: "/staff/reports/builder", label: "Report Builder" },
      { href: "/staff/reports/history", label: "Report History" }
    ]
  }
];

export function StaffSidebar({
  canAccessDataTools,
  canAccessGivingFuelModule,
  canAccessVolunteerCoordination,
  organizationName,
  organizationSlug,
  organizationLogoUrl
}: {
  canAccessDataTools?: boolean;
  canAccessGivingFuelModule?: boolean;
  canAccessVolunteerCoordination?: boolean;
  organizationName?: string;
  organizationSlug?: string;
  organizationLogoUrl?: string;
}) {
  const pathname = usePathname();
  const normalizedPathname = pathname.replace(/^\/[^/]+(?=\/staff(\/|$))/, "");
  const tenantPrefix = organizationSlug ? `/${organizationSlug}` : "";
  const withTenantPrefix = (href: string) => `${tenantPrefix}${href}`;
  const isPathActive = (baseHref: string) =>
    normalizedPathname === baseHref || normalizedPathname.startsWith(`${baseHref}/`);
  const menu = [
    ...BASE_MENU,
    ...(canAccessVolunteerCoordination
      ? ([
          {
            id: "volunteer-coordination",
            href: "/staff/volunteer-coordination",
            label: "Volunteer Coordination",
            matches: (path: string) => path.startsWith("/staff/volunteer-coordination"),
            children: [
              { href: "/staff/volunteer-coordination", label: "Dashboard" },
              {
                href: "/staff/volunteer-coordination/volunteers-recruiting",
                label: "Volunteers & Recruiting"
              },
              { href: "/staff/volunteer-coordination/events-roles", label: "Events & Roles" },
              {
                href: "/staff/volunteer-coordination/assignments-waitlists-substitutes",
                label: "Assignments / Waitlists / Substitutes"
              },
              { href: "/staff/volunteer-coordination/families-groups", label: "Families & Groups" },
              { href: "/staff/volunteer-coordination/hours-attendance", label: "Hours & Attendance" },
              {
                href: "/staff/volunteer-coordination/compliance-concerns-incidents",
                label: "Compliance / Concerns / Incidents"
              }
            ]
          } satisfies MenuItem
        ] as MenuItem[])
      : []),
    ...(canAccessDataTools
      ? ([
          {
            id: "data-tools",
            href: "/staff/data-tools",
            label: "Data Tools",
            matches: (path: string) =>
              path.startsWith("/staff/data-tools") ||
              path.startsWith("/staff/import-center") ||
              path.startsWith("/staff/admin/roles") ||
              path.startsWith("/staff/admin/tags") ||
              path.startsWith("/staff/admin/contacts/merge"),
            children: [
              { href: "/staff/data-tools", label: "Overview" },
              { href: "/staff/import-center", label: "Import Center" },
              { href: "/staff/import-center/contacts", label: "Contacts Import" },
              { href: "/staff/import-center/transactions", label: "Transactions Import" },
              ...(canAccessGivingFuelModule
                ? ([{ href: "/staff/data-tools/giving-fuel", label: "Giving Fuel" }] as Array<{
                    href: string;
                    label: string;
                  }>)
                : []),
              { href: "/staff/data-tools/bulk-tag-contacts", label: "Bulk Tag Contacts" },
              { href: "/staff/admin/roles", label: "Roles" },
              { href: "/staff/admin/tags", label: "Tags" },
              { href: "/staff/admin/contacts/merge", label: "Contact Merge" }
            ]
          } satisfies MenuItem
        ] as MenuItem[])
      : []),
    {
      id: "administration",
      href: "/staff/admin/users",
      label: "Administration",
      matches: (path: string) => path.startsWith("/staff/admin"),
      children: [
        { href: "/staff/admin/users", label: "Users" },
        { href: "/staff/admin/integrations", label: "Integrations" },
        { href: "/staff/admin/settings", label: "Organization Settings" }
      ]
    } satisfies MenuItem
  ];

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-col border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-8">
        <Link href={withTenantPrefix("/staff/dashboard")} className="block">
          {organizationLogoUrl ? (
            <img
              src={organizationLogoUrl}
              alt={`${organizationName || "Organization"} logo`}
              className="h-auto max-h-[72px] w-full max-w-[220px] rounded object-contain"
            />
          ) : (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
              {organizationName || "Tenant"}
            </div>
          )}
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto">
        {menu.map((item) => {
          const isActive = item.matches(normalizedPathname);
          return (
            <div key={item.href}>
              <Link
                className={cn(
                  "block rounded-md px-3 py-2 text-sm transition",
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-700 hover:bg-slate-100"
                )}
                href={withTenantPrefix(item.href)}
              >
                {item.label}
              </Link>
              {isActive && item.children ? (
                <div className="ml-3 mt-1 space-y-1 border-l border-slate-200 pl-3">
                  {item.children.map((child) => {
                    const childActive = isPathActive(child.href);
                    return (
                      <Link
                        key={child.href}
                        href={withTenantPrefix(child.href)}
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
      <div className="mt-6 border-t border-slate-200 pt-4">
        <Link href={withTenantPrefix("/staff/dashboard")} className="block">
          <Image
            src="/HerdCoreLogo.png"
            alt="HerdCore"
            width={180}
            height={60}
            className="h-auto w-full max-w-[180px] opacity-90"
            priority
          />
        </Link>
      </div>
    </aside>
  );
}
