import Link from "next/link";
import { ReactNode } from "react";
import { requirePortalIdentity } from "@/lib/auth/guards";

const navItems = [
  { href: "/portal", label: "Dashboard" },
  { href: "/portal/profile", label: "Profile" },
  { href: "/portal/donations", label: "Donations" },
  { href: "/portal/membership", label: "Membership" },
  { href: "/portal/communications", label: "Communications" },
  { href: "/portal/settings", label: "Settings" }
] as const;

export default async function PortalLayout({ children }: { children: ReactNode }) {
  await requirePortalIdentity();

  return (
    <div className="mx-auto min-h-screen w-full max-w-6xl px-6 py-6">
      <header className="mb-6 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Constituent Portal</h1>
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
