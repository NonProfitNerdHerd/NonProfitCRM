import { createClient } from "@/lib/supabase/server";
import { requireSessionContext } from "@/lib/auth/guards";

export async function createNotification(input: {
  recipientUserId: string;
  type: string;
  message: string;
  relatedEntityType: string;
  relatedEntityId?: string | null;
  actionUrl?: string | null;
}) {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { error } = await supabase.from("notifications").insert({
    organization_id: context.organizationId,
    recipient_user_id: input.recipientUserId,
    title: input.type,
    body: input.message,
    status: "unread",
    visibility_classification: "staff_public",
    created_by: context.userId,
    notification_type: input.type,
    related_entity_type: input.relatedEntityType,
    related_entity_id: input.relatedEntityId ?? null,
    action_url: input.actionUrl ?? null
  });

  if (error) throw error;
}

export async function listMyNotifications() {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, title, body, status, created_at, notification_type, related_entity_type, related_entity_id, action_url"
    )
    .eq("organization_id", context.organizationId)
    .eq("recipient_user_id", context.userId)
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) throw error;
  return data ?? [];
}

export async function markNotificationRead(notificationId: string) {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ status: "read" })
    .eq("organization_id", context.organizationId)
    .eq("recipient_user_id", context.userId)
    .eq("id", notificationId);

  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const context = await requireSessionContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("notifications")
    .update({ status: "read" })
    .eq("organization_id", context.organizationId)
    .eq("recipient_user_id", context.userId)
    .eq("status", "unread");

  if (error) throw error;
}
