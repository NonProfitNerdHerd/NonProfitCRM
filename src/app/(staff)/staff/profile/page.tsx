import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export default async function StaffProfilePage() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const [{ data: profile }, { data: organization }] = await Promise.all([
    user
      ? supabase
          .from("profiles")
          .select("display_name,created_at,updated_at")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("organizations").select("name,slug").eq("id", context.organizationId).maybeSingle()
  ]);

  return (
    <Card>
      <CardHeader title="My Profile" subtitle="Your signed-in staff account details." />
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-semibold text-slate-700">Display Name:</span>{" "}
          {String(profile?.display_name ?? "-")}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Email:</span> {String(user?.email ?? "-")}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Organization:</span>{" "}
          {String(organization?.name ?? "-")} ({String(organization?.slug ?? "-")})
        </p>
      </div>
    </Card>
  );
}
