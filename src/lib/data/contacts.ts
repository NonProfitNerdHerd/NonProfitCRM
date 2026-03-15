import { createClient } from "@/lib/supabase/server";
import { ContactInput } from "@/lib/validation/contact";
import { requireStaffPermission } from "@/lib/auth/guards";

function isContactExtendedSchemaError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return (
    message.includes("formal_letter_name") ||
    message.includes("mobile_number") ||
    message.includes("emergency_contact") ||
    message.includes("emergency_contact_phone")
  );
}

export async function listContacts(mode: "all" | "personal" | "organizations" = "all") {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  let query = supabase
    .from("contacts_safe_view")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("last_name", { ascending: true })
    .limit(200);

  if (mode === "personal") {
    query = query.is("organization_name", null);
  }
  if (mode === "organizations") {
    query = query.not("organization_name", "is", null).neq("organization_name", "");
  }

  const { data, error } = await query;

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

  const insertPayload = {
      organization_id: context.organizationId,
      first_name: input.first_name,
      last_name: input.last_name,
      preferred_name: input.preferred_name || null,
      formal_letter_name: input.formal_letter_name || null,
      email: input.email || null,
      alternate_email: input.alternate_email || null,
      phone: input.phone || null,
      mobile_number: input.mobile_number || null,
      alternate_phone: input.alternate_phone || null,
      emergency_contact: input.emergency_contact || null,
      emergency_contact_phone: input.emergency_contact_phone || null,
      communication_preferences: input.communication_preferences ?? [],
      address_line_1: input.address_line_1 || null,
      address_line_2: input.address_line_2 || null,
      city: input.city || null,
      state: input.state || null,
      postal_code: input.postal_code || null,
      mailing_address_line_1: input.mailing_address_line_1 || null,
      mailing_address_line_2: input.mailing_address_line_2 || null,
      mailing_city: input.mailing_city || null,
      mailing_state: input.mailing_state || null,
      mailing_postal_code: input.mailing_postal_code || null,
      organization_name: input.organization_name || null,
      donor_status: input.donor_status,
      member_status: input.member_status,
      created_by: context.userId,
      updated_by: context.userId
  };

  let { data, error } = await supabase
    .from("contacts")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error && isContactExtendedSchemaError(error)) {
    const {
      formal_letter_name: removedFormalLetterName,
      mobile_number: removedMobileNumber,
      emergency_contact: removedEmergencyContact,
      emergency_contact_phone: removedEmergencyContactPhone,
      ...legacyPayload
    } = insertPayload;
    void removedFormalLetterName;
    void removedMobileNumber;
    void removedEmergencyContact;
    void removedEmergencyContactPhone;

    const retryResult = await supabase.from("contacts").insert(legacyPayload).select("id").single();
    data = retryResult.data;
    error = retryResult.error;
  }

  if (error) throw error;
  if (!data?.id) throw new Error("Contact insert did not return an id.");
  return data.id;
}

export async function updateContact(contactId: string, input: ContactInput) {
  const context = await requireStaffPermission("can_edit_contacts");
  const supabase = await createClient();

  const updatePayload = {
      first_name: input.first_name,
      last_name: input.last_name,
      preferred_name: input.preferred_name || null,
      formal_letter_name: input.formal_letter_name || null,
      email: input.email || null,
      alternate_email: input.alternate_email || null,
      phone: input.phone || null,
      mobile_number: input.mobile_number || null,
      alternate_phone: input.alternate_phone || null,
      emergency_contact: input.emergency_contact || null,
      emergency_contact_phone: input.emergency_contact_phone || null,
      communication_preferences: input.communication_preferences ?? [],
      address_line_1: input.address_line_1 || null,
      address_line_2: input.address_line_2 || null,
      city: input.city || null,
      state: input.state || null,
      postal_code: input.postal_code || null,
      mailing_address_line_1: input.mailing_address_line_1 || null,
      mailing_address_line_2: input.mailing_address_line_2 || null,
      mailing_city: input.mailing_city || null,
      mailing_state: input.mailing_state || null,
      mailing_postal_code: input.mailing_postal_code || null,
      organization_name: input.organization_name || null,
      donor_status: input.donor_status,
      member_status: input.member_status,
      updated_by: context.userId,
      updated_at: new Date().toISOString()
  };

  let { error } = await supabase
    .from("contacts")
    .update(updatePayload)
    .eq("organization_id", context.organizationId)
    .eq("id", contactId);
  if (error && isContactExtendedSchemaError(error)) {
    const {
      formal_letter_name: removedFormalLetterName,
      mobile_number: removedMobileNumber,
      emergency_contact: removedEmergencyContact,
      emergency_contact_phone: removedEmergencyContactPhone,
      ...legacyPayload
    } = updatePayload;
    void removedFormalLetterName;
    void removedMobileNumber;
    void removedEmergencyContact;
    void removedEmergencyContactPhone;

    const retryResult = await supabase
      .from("contacts")
      .update(legacyPayload)
      .eq("organization_id", context.organizationId)
      .eq("id", contactId);
    error = retryResult.error;
  }

  if (error) throw error;
}
