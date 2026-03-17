import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export default async function PlatformAdminProfilePage() {
  const context = await requirePlatformAdminAccess();
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("profiles")
        .select("display_name,created_at,updated_at")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  return (
    <Card>
      <CardHeader title="My Profile" subtitle="Your platform administration account details." />
      <div className="space-y-2 text-sm">
        <p>
          <span className="font-semibold text-slate-700">Display Name:</span>{" "}
          {String(profile?.display_name ?? "-")}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Email:</span> {String(user?.email ?? "-")}
        </p>
        <p>
          <span className="font-semibold text-slate-700">Platform Roles:</span> {context.roles.join(", ")}
        </p>
      </div>
    </Card>
  );
}
