import { createClient } from "@/lib/supabase/server";
import { GlobalSearch } from "@/components/search/global-search";

export async function StaffHeader({ organizationId }: { organizationId: string }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const [{ data: organization }, { data: profile }] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle(),
    user
      ? supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  const displayIdentity = profile?.display_name || user?.email || "-";

  return (
    <header className="mb-6">
      <div
        className="flex items-center justify-between border border-slate-200 bg-white px-5 py-3 shadow-sm"
        style={{
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          borderBottomLeftRadius: 5,
          borderBottomRightRadius: 5
        }}
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Organization
          </p>
          <p className="text-sm font-semibold text-slate-900">
            {organization?.name ?? "Unknown Organization"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500">Signed in as</p>
          <p className="text-sm font-medium text-slate-900">{displayIdentity}</p>
        </div>
      </div>
      <div
        className="mt-[10px] rounded-[10px] border border-slate-200 bg-white px-5 py-3 shadow-sm"
      >
        <GlobalSearch />
      </div>
    </header>
  );
}
