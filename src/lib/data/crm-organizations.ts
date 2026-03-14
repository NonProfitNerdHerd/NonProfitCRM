import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity } from "@/lib/data/activity-log";

export async function listCrmOrganizations() {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_organizations")
    .select("id, name, description, created_at")
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getCrmOrganization(id: string) {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const [{ data: organization, error: orgError }, { data: contacts, error: contactsError }] =
    await Promise.all([
      supabase
        .from("crm_organizations")
        .select("id, name, description, created_at")
        .eq("organization_id", context.organizationId)
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("contact_organization_links")
        .select("id, contacts(id, first_name, last_name, email)")
        .eq("organization_id", context.organizationId)
        .eq("crm_organization_id", id)
    ]);

  if (orgError) throw orgError;
  if (contactsError) throw contactsError;

  return {
    organization,
    contacts: contacts ?? []
  };
}

export async function createCrmOrganization(input: {
  name: string;
  description?: string;
}) {
  const context = await requireStaffPermission("can_edit_contacts");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("crm_organizations")
    .insert({
      organization_id: context.organizationId,
      name: input.name,
      description: input.description ?? null,
      created_by: context.userId
    })
    .select("id")
    .single();

  if (error) throw error;

  await recordActivity({
    entityType: "crm_organization",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Created organization ${input.name}`
  });

  return data.id;
}
