import { createClient } from "@/lib/supabase/server";
import { GlobalSearch } from "@/components/search/global-search";
import { UserAccountMenu } from "@/components/layout/user-account-menu";

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
        className="rounded-[10px] border border-slate-200 bg-white px-5 py-3 shadow-lg shadow-slate-200/60"
        style={{
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:basis-2/3">
            <GlobalSearch />
          </div>
          <div className="w-full text-left md:basis-1/3 md:text-right">
            <p className="text-sm font-semibold text-slate-900">
              {organization?.name ?? "Unknown Organization"}
            </p>
            <div className="mt-1 flex items-center gap-2 text-sm md:justify-end">
              <span className="text-slate-500">Signed in as</span>
              <UserAccountMenu displayName={displayIdentity} profileHref="/staff/profile" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
