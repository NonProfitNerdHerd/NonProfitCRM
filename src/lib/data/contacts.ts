import { createClient } from "@/lib/supabase/server";
import { ContactInput } from "@/lib/validation/contact";
import { requireStaffPermission } from "@/lib/auth/guards";

export async function listContacts() {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts_safe_view")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("last_name", { ascending: true })
    .limit(200);

  if (error) throw error;
  return data ?? [];
}

export async function getContact(contactId: string) {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts_safe_view")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", contactId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function createContact(input: ContactInput) {
  const context = await requireStaffPermission("can_create_contacts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      organization_id: context.organizationId,
      first_name: input.first_name,
      last_name: input.last_name,
      preferred_name: input.preferred_name || null,
      email: input.email || null,
      phone: input.phone || null,
      organization_name: input.organization_name || null,
      donor_status: input.donor_status,
      member_status: input.member_status,
      created_by: context.userId,
      updated_by: context.userId
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}
