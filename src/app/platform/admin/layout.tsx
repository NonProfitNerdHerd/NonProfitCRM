import type { ReactNode } from "react";
import Link from "next/link";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";

export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const context = await requirePlatformAdminAccess();

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-72 border-r border-slate-200 bg-white p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Platform Console</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-900">NonProfitNerdHerd Admin</h1>
        <p className="mt-2 text-xs text-slate-500">Roles: {context.roles.join(", ")}</p>
        <nav className="mt-6 space-y-1">
          <Link className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100" href="/platform/admin">
            Dashboard
          </Link>
          <Link
            className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100"
            href="/platform/admin/tenants"
          >
            Tenant Registry
          </Link>
          <Link
            className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100"
            href="/platform/admin/backup-tiers"
          >
            Backup Tiers
          </Link>
          <Link
            className="block rounded-md px-3 py-2 text-sm hover:bg-slate-100"
            href="/platform/admin/restore-requests"
          >
            Restore Requests
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
