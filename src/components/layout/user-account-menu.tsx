"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function UserAccountMenu({
  displayName,
  profileHref
}: {
  displayName: string;
  profileHref: string;
}) {
  const router = useRouter();

  async function onLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <details className="relative inline-block text-left">
      <summary className="list-none cursor-pointer rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50">
        <span className="inline-flex items-center gap-2">
          <span className="max-w-[220px] truncate">{displayName || "Account"}</span>
          <span aria-hidden="true" className="text-xs text-slate-500">
            ▼
          </span>
        </span>
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-slate-200 bg-white p-1 shadow-lg">
        <Link
          href={profileHref}
          className="block rounded px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          My Profile
        </Link>
        <button
          type="button"
          onClick={() => void onLogout()}
          className="block w-full rounded px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
        >
          Log out
        </button>
      </div>
    </details>
  );
}
