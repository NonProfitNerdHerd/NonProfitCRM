import { createClient } from "@/lib/supabase/server";
import { requirePortalIdentity, requireStaffPermission } from "@/lib/auth/guards";

export async function listTasksForStaff() {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks_safe_view")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("due_date", { ascending: true })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export async function listContactNotes(contactId: string) {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes_safe_view")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listPortalCommunications() {
  const context = await requirePortalIdentity();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("communication_log")
    .select("id, channel, subject, summary, sent_at")
    .eq("organization_id", context.organizationId)
    .eq("recipient_user_id", context.userId)
    .eq("visibility_classification", "portal_visible")
    .order("sent_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function listPortalNotifications() {
  const context = await requirePortalIdentity();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notifications")
    .select("id, title, body, status, created_at")
    .eq("organization_id", context.organizationId)
    .eq("recipient_user_id", context.userId)
    .eq("visibility_classification", "portal_visible")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
