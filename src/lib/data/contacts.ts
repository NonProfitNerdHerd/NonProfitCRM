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
    message.includes("emergency_contact_phone") ||
    message.includes("entity_type") ||
    message.includes("tracking_status") ||
    message.includes("webconnex_id")
  );
}

function normalizeEntityType(input: ContactInput) {
  if (input.entity_type === "organization") return "organization";
  return "person";
}

function normalizeTrackingStatus(input: ContactInput, webconnexId: string | null) {
  if (webconnexId) return "donor";
  return input.tracking_status;
}

function donorStatusFromTrackingStatus(trackingStatus: "donor" | "lead" | "non_lead") {
  if (trackingStatus === "donor") return "active";
  if (trackingStatus === "non_lead") return "inactive";
  return "prospect";
}

function buildOrganizationFormalLetterName(input: ContactInput) {
  const org = input.organization_name?.trim() ?? "";
  const primaryName = [input.first_name?.trim() ?? "", input.last_name?.trim() ?? ""]
    .filter(Boolean)
    .join(" ");
  if (!org && !primaryName) return "";
  if (!org) return primaryName;
  if (!primaryName) return org;
  return `${org}\nc/o ${primaryName}`;
}

function isClassificationSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return (
    message.includes("entity_type") ||
    message.includes("tracking_status") ||
    message.includes("webconnex_id")
  );
}

function normalizeLegacyClassification(row: Record<string, unknown>) {
  const organizationName = String(row.organization_name ?? "").trim();
  const donorStatus = String(row.donor_status ?? "").toLowerCase();
  const externalSource = String(row.external_source ?? "").toLowerCase();
  const externalSourceId = String(row.external_source_id ?? "").trim();
  const webconnexId = String(row.webconnex_id ?? "").trim();
  const hasOrganization = organizationName.length > 0;
  const hasWebconnexLink =
    webconnexId.length > 0 ||
    (externalSourceId.length > 0 && (externalSource === "webconnex" || externalSource === "givingfuel"));
  const isDonorStatus = donorStatus === "active" || donorStatus === "lapsed";
  const trackingStatus = hasWebconnexLink
    ? "donor"
    : isDonorStatus
      ? "donor"
      : donorStatus === "inactive"
        ? "non_lead"
        : "lead";
  const entityType = hasOrganization ? "organization" : "person";

  return {
    ...row,
    entity_type: entityType,
    tracking_status: trackingStatus,
    webconnex_id: webconnexId || null
  };
}

export async function listContacts(
  mode:
    | "all"
    | "donors"
    | "contacts"
    | "donor_organizations"
    | "organizations"
    | "personal" = "all"
) {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  let modernQuery = supabase
    .from("contacts_safe_view")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("last_name", { ascending: true })
    .limit(200);
  if (mode === "donors") {
    modernQuery = modernQuery.eq("entity_type", "person").eq("tracking_status", "donor");
  }
  if (mode === "contacts" || mode === "personal") {
    modernQuery = modernQuery.eq("entity_type", "person").in("tracking_status", ["lead", "non_lead"]);
  }
  if (mode === "donor_organizations") {
    modernQuery = modernQuery.eq("entity_type", "organization").eq("tracking_status", "donor");
  }
  if (mode === "organizations") {
    modernQuery = modernQuery.eq("entity_type", "organization").in("tracking_status", ["lead", "non_lead"]);
  }

  const modernResult = await modernQuery;
  if (!modernResult.error) {
    return modernResult.data ?? [];
  }
  if (!isClassificationSchemaMissingError(modernResult.error)) {
    throw modernResult.error;
  }

  let fallbackQuery = supabase
    .from("contacts_safe_view")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("last_name", { ascending: true })
    .limit(400);
  if (mode === "donors" || mode === "contacts" || mode === "personal") {
    fallbackQuery = fallbackQuery.or("organization_name.is.null,organization_name.eq.");
  }
  if (mode === "donor_organizations" || mode === "organizations") {
    fallbackQuery = fallbackQuery.not("organization_name", "is", null).neq("organization_name", "");
  }

  const fallbackResult = await fallbackQuery;
  if (fallbackResult.error) throw fallbackResult.error;

  const normalized = (fallbackResult.data ?? []).map((row) =>
    normalizeLegacyClassification(row as Record<string, unknown>)
  );
  return normalized.filter((row) => {
    const entityType = String(row.entity_type ?? "");
    const trackingStatus = String(row.tracking_status ?? "");
    if (mode === "donors") return entityType === "person" && trackingStatus === "donor";
    if (mode === "contacts" || mode === "personal") {
      return entityType === "person" && (trackingStatus === "lead" || trackingStatus === "non_lead");
    }
    if (mode === "donor_organizations") {
      return entityType === "organization" && trackingStatus === "donor";
    }
    if (mode === "organizations") {
      return (
        entityType === "organization" &&
        (trackingStatus === "lead" || trackingStatus === "non_lead")
      );
    }
    return true;
  });
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
  const entityType = normalizeEntityType(input);
  const webconnexId = input.webconnex_id?.trim() || null;
  const trackingStatus = normalizeTrackingStatus(input, webconnexId);
  const formalLetterName = input.formal_letter_name?.trim()
    ? input.formal_letter_name.trim()
    : entityType === "organization"
      ? buildOrganizationFormalLetterName(input)
      : null;
  const donorStatus = input.donor_status ?? donorStatusFromTrackingStatus(trackingStatus);

  const insertPayload = {
    organization_id: context.organizationId,
    first_name: input.first_name,
    last_name: input.last_name,
    preferred_name: input.preferred_name || null,
    formal_letter_name: formalLetterName,
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
    organization_name:
      entityType === "organization" ? input.organization_name?.trim() || null : null,
    entity_type: entityType,
    tracking_status: trackingStatus,
    webconnex_id: webconnexId,
    donor_status: donorStatus,
    member_status: input.member_status ?? "none",
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
      entity_type: removedEntityType,
      tracking_status: removedTrackingStatus,
      webconnex_id: removedWebconnexId,
      ...legacyPayload
    } = insertPayload;
    void removedFormalLetterName;
    void removedMobileNumber;
    void removedEmergencyContact;
    void removedEmergencyContactPhone;
    void removedEntityType;
    void removedTrackingStatus;
    void removedWebconnexId;

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
  const { data: existingContact, error: initialExistingError } = await supabase
    .from("contacts")
    .select("tracking_status, webconnex_id, donor_status, external_source, external_source_id")
    .eq("organization_id", context.organizationId)
    .eq("id", contactId)
    .maybeSingle();
  let existingError = initialExistingError;
  let existingContactRecord = (existingContact ?? null) as Record<string, unknown> | null;
  if (existingError && isClassificationSchemaMissingError(existingError)) {
    const fallbackResult = await supabase
      .from("contacts")
      .select("donor_status, external_source, external_source_id")
      .eq("organization_id", context.organizationId)
      .eq("id", contactId)
      .maybeSingle();
    existingContactRecord = (fallbackResult.data ?? null) as Record<string, unknown> | null;
    existingError = fallbackResult.error;
  }
  if (existingError) throw existingError;

  const existingTrackingStatusRaw = String(existingContactRecord?.tracking_status ?? "").toLowerCase();
  const existingDonorStatus = String(existingContactRecord?.donor_status ?? "").toLowerCase();
  const existingTrackingStatus =
    existingTrackingStatusRaw ||
    (existingDonorStatus === "active" || existingDonorStatus === "lapsed"
      ? "donor"
      : existingDonorStatus === "inactive"
        ? "non_lead"
        : "lead");
  const legacyExternalSource = String(existingContactRecord?.external_source ?? "").toLowerCase();
  const legacyExternalSourceId = String(existingContactRecord?.external_source_id ?? "").trim();
  const existingWebconnexId =
    String(existingContactRecord?.webconnex_id ?? "").trim() ||
    ((legacyExternalSource === "webconnex" || legacyExternalSource === "givingfuel") &&
    legacyExternalSourceId
      ? legacyExternalSourceId
      : "");
  const incomingWebconnexId = input.webconnex_id?.trim() ?? "";
  const webconnexId = incomingWebconnexId || existingWebconnexId || null;
  const entityType = normalizeEntityType(input);
  const trackingStatus = normalizeTrackingStatus(input, webconnexId);

  if (existingTrackingStatus === "donor" && trackingStatus !== "donor") {
    throw new Error("Donor classification cannot be downgraded.");
  }

  const formalLetterName = input.formal_letter_name?.trim()
    ? input.formal_letter_name.trim()
    : entityType === "organization"
      ? buildOrganizationFormalLetterName(input)
      : null;
  const donorStatus = input.donor_status ?? donorStatusFromTrackingStatus(trackingStatus);

  const updatePayload = {
    first_name: input.first_name,
    last_name: input.last_name,
    preferred_name: input.preferred_name || null,
    formal_letter_name: formalLetterName,
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
    organization_name:
      entityType === "organization" ? input.organization_name?.trim() || null : null,
    entity_type: entityType,
    tracking_status: trackingStatus,
    webconnex_id: webconnexId,
    donor_status: donorStatus,
    member_status: input.member_status ?? "none",
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
      entity_type: removedEntityType,
      tracking_status: removedTrackingStatus,
      webconnex_id: removedWebconnexId,
      ...legacyPayload
    } = updatePayload;
    void removedFormalLetterName;
    void removedMobileNumber;
    void removedEmergencyContact;
    void removedEmergencyContactPhone;
    void removedEntityType;
    void removedTrackingStatus;
    void removedWebconnexId;

    const retryResult = await supabase
      .from("contacts")
      .update(legacyPayload)
      .eq("organization_id", context.organizationId)
      .eq("id", contactId);
    error = retryResult.error;
  }

  if (error) throw error;
}
