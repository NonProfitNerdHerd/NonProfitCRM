import { createClient } from "@/lib/supabase/server";
import { requirePortalIdentity } from "@/lib/auth/guards";

export async function getPortalContact() {
  const context = await requirePortalIdentity();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts_safe_view")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("portal_user_id", context.userId)
    .single();

  if (error) throw error;
  return data;
}

export async function updatePortalProfile(input: {
  preferred_name?: string;
  phone?: string;
  email?: string;
  communication_preferences?: Record<string, unknown>;
}) {
  const context = await requirePortalIdentity();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("portal_user_id", context.userId)
    .single();

  if (!contact) {
    throw new Error("Portal contact link not found.");
  }

  const { error } = await supabase
    .from("contacts")
    .update({
      preferred_name: input.preferred_name ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      communication_preferences: input.communication_preferences ?? {}
    })
    .eq("organization_id", context.organizationId)
    .eq("id", contact.id);

  if (error) throw error;
}
