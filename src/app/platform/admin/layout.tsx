import type { ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { UserAccountMenu } from "@/components/layout/user-account-menu";

export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  const context = await requirePlatformAdminAccess();
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
    : { data: null };
  const displayIdentity = String(profile?.display_name ?? user?.email ?? "Account");

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-72 border-r border-emerald-200 bg-emerald-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Platform Console</p>
        <Link href="/platform/admin" className="mt-2 block">
          <Image
            src="/HerdCoreLogo.png"
            alt="HerdCode"
            width={220}
            height={72}
            className="h-auto w-full max-w-[220px]"
            priority
          />
        </Link>
        <p className="mt-2 text-xs text-slate-500">Roles: {context.roles.join(", ")}</p>
        <nav className="mt-6 space-y-1">
          <Link className="block rounded-md px-3 py-2 text-sm hover:bg-emerald-100" href="/platform/admin">
            Dashboard
          </Link>
          <Link
            className="block rounded-md px-3 py-2 text-sm hover:bg-emerald-100"
            href="/platform/admin/tenants"
          >
            Tenant Registry
          </Link>
          <Link
            className="block rounded-md px-3 py-2 text-sm hover:bg-emerald-100"
            href="/platform/admin/tenants/new"
          >
            New Tenant
          </Link>
          <Link
            className="block rounded-md px-3 py-2 text-sm hover:bg-emerald-100"
            href="/platform/admin/backup-tiers"
          >
            Backup Tiers
          </Link>
          <Link
            className="block rounded-md px-3 py-2 text-sm hover:bg-emerald-100"
            href="/platform/admin/restore-requests"
          >
            Restore Requests
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <div className="mb-4 flex items-center justify-end">
          <UserAccountMenu
            displayName={displayIdentity}
            profileHref="/platform/admin/profile"
            logoutHref="/platform/login"
          />
        </div>
        {children}
      </main>
    </div>
  );
}
