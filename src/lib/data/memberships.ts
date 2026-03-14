import { createClient } from "@/lib/supabase/server";
import { requirePortalIdentity, requireStaffPermission } from "@/lib/auth/guards";

export async function listMembershipsForStaff() {
  const context = await requireStaffPermission("can_manage_memberships");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select(
      "id, status, level, start_date, renewal_date, contacts(first_name,last_name), membership_types(name)"
    )
    .eq("organization_id", context.organizationId)
    .order("renewal_date", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getMembership(id: string) {
  const context = await requireStaffPermission("can_manage_memberships");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("memberships")
    .select("*, contacts(first_name,last_name,email), membership_types(name, benefits)")
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listPortalMemberships() {
  const context = await requirePortalIdentity();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("portal_user_id", context.userId)
    .single();

  if (!contact) return [];

  const { data, error } = await supabase
    .from("memberships")
    .select("id, status, level, start_date, end_date, renewal_date, membership_types(name)")
    .eq("organization_id", context.organizationId)
    .eq("contact_id", contact.id)
    .order("start_date", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function updateMembershipStatus(input: {
  membershipId: string;
  status: "active" | "inactive";
}) {
  const context = await requireStaffPermission("can_manage_memberships");
  const supabase = await createClient();

  const { error } = await supabase
    .from("memberships")
    .update({ status: input.status })
    .eq("organization_id", context.organizationId)
    .eq("id", input.membershipId);

  if (error) throw error;
}

export async function listMembershipTypes() {
  const context = await requireStaffPermission("can_manage_memberships");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("membership_types")
    .select("id, key, name, description, membership_length, length_unit, status, created_at")
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createMembershipType(input: {
  name: string;
  description?: string;
  membershipLength: number;
  lengthUnit: "days" | "months" | "years";
  status: "active" | "inactive";
}) {
  const context = await requireStaffPermission("can_manage_memberships");
  const supabase = await createClient();

  const key = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const { data, error } = await supabase
    .from("membership_types")
    .insert({
      organization_id: context.organizationId,
      key,
      name: input.name,
      description: input.description ?? null,
      membership_length: input.membershipLength,
      length_unit: input.lengthUnit,
      status: input.status,
      default_duration_months:
        input.lengthUnit === "months"
          ? input.membershipLength
          : input.lengthUnit === "years"
            ? input.membershipLength * 12
            : null
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function getMembershipTypeWithMembers(typeId: string) {
  const context = await requireStaffPermission("can_manage_memberships");
  const supabase = await createClient();

  const [{ data: type, error: typeError }, { data: members, error: memberError }] =
    await Promise.all([
      supabase
        .from("membership_types")
        .select("id, key, name, description, membership_length, length_unit, status")
        .eq("organization_id", context.organizationId)
        .eq("id", typeId)
        .maybeSingle(),
      supabase
        .from("memberships")
        .select("id, status, level, start_date, end_date, renewal_date, contacts(id, first_name, last_name, email)")
        .eq("organization_id", context.organizationId)
        .eq("membership_type_id", typeId)
        .order("start_date", { ascending: false })
    ]);

  if (typeError) throw typeError;
  if (memberError) throw memberError;

  return { type, members: members ?? [] };
}
