import { createClient } from "@/lib/supabase/server";
import { requireSessionContext } from "@/lib/auth/guards";

export async function recordActivity(input: {
  entityType: string;
  entityId: string;
  actionType: string;
  actionSummary: string;
  relatedContactId?: string | null;
}) {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { error } = await supabase.from("activity_log").insert({
    organization_id: context.organizationId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    related_contact_id: input.relatedContactId ?? null,
    action_type: input.actionType,
    action_summary: input.actionSummary,
    performed_by_user_id: context.userId
  });

  if (error) throw error;
}

export async function listContactActivity(contactId: string) {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("activity_log")
    .select("id, entity_type, entity_id, action_type, action_summary, created_at, performed_by_user_id")
    .eq("organization_id", context.organizationId)
    .eq("related_contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}
