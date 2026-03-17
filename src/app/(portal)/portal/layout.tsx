import Link from "next/link";
import { ReactNode } from "react";
import { requirePortalIdentity } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const context = await requirePortalIdentity();
  const supabase = await createClient();
  const { data: organization } = await supabase
    .from("organizations")
    .select("name,slug")
    .eq("id", context.organizationId)
    .maybeSingle();
  const tenantPrefix = String(organization?.slug ?? "").trim()
    ? `/${String(organization?.slug)}`
    : "";
  const navItems = [
    { href: `${tenantPrefix}/portal`, label: "Dashboard" },
    { href: `${tenantPrefix}/portal/profile`, label: "Profile" },
    { href: `${tenantPrefix}/portal/donations`, label: "Donations" },
    { href: `${tenantPrefix}/portal/membership`, label: "Membership" },
    { href: `${tenantPrefix}/portal/communications`, label: "Communications" },
    { href: `${tenantPrefix}/portal/settings`, label: "Settings" }
  ] as const;

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-6 py-6">
      <header className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Constituent Portal{organization?.name ? ` · ${String(organization.name)}` : ""}
        </h1>
        <p className="text-sm text-slate-600">
          View your profile, donations, memberships, and approved communications.
        </p>
      </header>
      <nav className="mb-6 flex flex-wrap gap-2">
        {navItems.map((item) => (
          <Link
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
