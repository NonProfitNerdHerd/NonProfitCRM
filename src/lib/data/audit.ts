import { createClient } from "@/lib/supabase/server";

export async function logAuditEvent(input: {
  organizationId: string;
  actorUserId: string;
  actionType: string;
  targetEntityType: string;
  targetEntityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("audit_log").insert({
    organization_id: input.organizationId,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId ?? null,
    metadata: input.metadata ?? {}
  });

  if (error) {
    throw error;
  }
}
