import { createClient } from "@/lib/supabase/server";

export async function StaffHeader({ organizationId }: { organizationId: string }) {
  const supabase = await createClient();
  const { data: organization } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organizationId)
    .maybeSingle();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  return (
    <header className="mb-6 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Organization Context
        </p>
        <p className="text-sm font-semibold text-slate-900">
          {organization?.name ?? "Unknown Organization"}
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs text-slate-500">Signed in as</p>
        <p className="text-sm font-medium text-slate-900">{user?.email ?? "-"}</p>
      </div>
    </header>
  );
}
