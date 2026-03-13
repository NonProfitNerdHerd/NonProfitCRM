import { Card, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { formatDate } from "@/lib/utils";

export default async function AuditLogPage() {
  const context = await requireStaffPermission("can_view_audit_log");
  const supabase = await createClient();

  const { data: entries } = await supabase
    .from("audit_log")
    .select("id, action_type, target_entity_type, target_entity_id, metadata, created_at")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <Card>
      <CardHeader
        title="Audit Log"
        subtitle="Governance trail for imports, permissions, reports, and sensitive actions"
      />
      <div className="space-y-3 text-sm">
        {(entries ?? []).map((entry) => (
          <article className="rounded-md border border-slate-200 p-3" key={entry.id}>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium text-slate-900">{entry.action_type}</p>
              <p className="text-xs text-slate-500">{formatDate(entry.created_at)}</p>
            </div>
            <p className="text-slate-700">
              {entry.target_entity_type} {entry.target_entity_id ? `(${entry.target_entity_id})` : ""}
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
              {JSON.stringify(entry.metadata ?? {}, null, 2)}
            </pre>
          </article>
        ))}
      </div>
    </Card>
  );
}
