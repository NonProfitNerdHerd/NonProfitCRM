import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity, listContactActivity } from "@/lib/data/activity-log";
import { createTask } from "@/lib/data/tasks";
import { createDonationForStaff } from "@/lib/data/donations";

function taskUrgencyColor(
  tasks: Array<{ due_date: string | null; completed_at: string | null }>
): "default" | "yellow" | "red" {
  const now = new Date();
  const inFiveDays = new Date(now);
  inFiveDays.setDate(now.getDate() + 5);
  const inThirtyDays = new Date(now);
  inThirtyDays.setDate(now.getDate() + 30);

  let hasRed = false;
  let hasYellow = false;

  for (const task of tasks) {
    if (task.completed_at || !task.due_date) continue;
    const due = new Date(task.due_date);
    if (due < now || due <= inFiveDays) hasRed = true;
    else if (due <= inThirtyDays) hasYellow = true;
  }

  if (hasRed) return "red";
  if (hasYellow) return "yellow";
  return "default";
}

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

function isDonationOrgSchemaError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return message.includes("crm_organization_id") || message.includes("crm_organizations");
}

async function fetchContactDonations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  contactId: string
) {
  const fullSelect =
    "id, donation_date, amount, payment_type, check_number, transaction_id, memo, source_platform, external_transaction_id, is_recurring, crm_organization_id, created_by, created_at, campaign_id, campaigns(name,status), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status))";
  const legacySelect =
    "id, donation_date, amount, payment_type, check_number, transaction_id, memo, source_platform, external_transaction_id, is_recurring, created_by, created_at, campaign_id, campaigns(name,status), donation_allocations(campaign_id, allocation_amount, campaigns(id,name,status))";

  const fullResult = (await supabase
    .from("donations")
    .select(fullSelect)
    .eq("organization_id", organizationId)
    .eq("contact_id", contactId)
    .order("donation_date", { ascending: false })) as unknown as {
    data: Array<Record<string, unknown>> | null;
    error: unknown;
  };

  if (fullResult.error && isDonationOrgSchemaError(fullResult.error)) {
    const legacyResult = (await supabase
      .from("donations")
      .select(legacySelect)
      .eq("organization_id", organizationId)
      .eq("contact_id", contactId)
      .order("donation_date", { ascending: false })) as unknown as {
      data: Array<Record<string, unknown>> | null;
      error: unknown;
    };
    return legacyResult;
  }

  return fullResult;
}

async function fetchContactRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  contactId: string
) {
  const fullSelect =
    "id, organization_id, first_name, last_name, preferred_name, formal_letter_name, organization_name, donor_status, member_status, email, alternate_email, phone, mobile_number, alternate_phone, emergency_contact, emergency_contact_phone, communication_preferences, address_line_1, address_line_2, city, state, postal_code, mailing_address_line_1, mailing_address_line_2, mailing_city, mailing_state, mailing_postal_code, created_at, updated_at";
  const legacySelect =
    "id, organization_id, first_name, last_name, preferred_name, organization_name, donor_status, member_status, email, alternate_email, phone, alternate_phone, communication_preferences, address_line_1, address_line_2, city, state, postal_code, mailing_address_line_1, mailing_address_line_2, mailing_city, mailing_state, mailing_postal_code, created_at, updated_at";

  const fullResult = (await supabase
    .from("contacts")
    .select(fullSelect)
    .eq("organization_id", organizationId)
    .eq("id", contactId)
    .maybeSingle()) as unknown as { data: Record<string, unknown> | null; error: unknown };

  if (fullResult.error && isContactExtendedSchemaError(fullResult.error)) {
    const legacyResult = (await supabase
      .from("contacts")
      .select(legacySelect)
      .eq("organization_id", organizationId)
      .eq("id", contactId)
      .maybeSingle()) as unknown as { data: Record<string, unknown> | null; error: unknown };
    if (legacyResult.error) return legacyResult;
    return {
      data: legacyResult.data
        ? {
            ...legacyResult.data,
            formal_letter_name: null,
            mobile_number: null,
            emergency_contact: null,
            emergency_contact_phone: null
          }
        : null,
      error: null
    };
  }

  return fullResult;
}

export async function getContactProfileData(contactId: string) {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const [
    { data: contact, error: contactError },
    { data: emails, error: emailsError },
    { data: phones, error: phonesError },
    { data: organizations, error: organizationsError },
    { data: donations, error: donationsError },
    { data: notes, error: notesError },
    { data: tasks, error: tasksError },
    { data: memberships, error: membershipsError },
    { data: campaigns, error: campaignsError },
    activity
  ] = await Promise.all([
    fetchContactRecord(supabase, context.organizationId, contactId),
    supabase
      .from("contact_emails")
      .select("id, email, label, is_primary")
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("contact_phones")
      .select("id, phone, label, is_primary")
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("contact_organization_links")
      .select("id, crm_organizations(id, name, description)")
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId),
    fetchContactDonations(supabase, context.organizationId, contactId),
    supabase
      .from("notes")
      .select("id, body, note_type, created_at, created_by")
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select(
        "id, title, description, due_date, status, priority, assigned_to, completed_at, created_by, created_at, project_id, projects(name)"
      )
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("due_date", { ascending: true }),
    supabase
      .from("memberships")
      .select(
        "id, status, level, start_date, end_date, renewal_date, created_by, created_at, membership_types(name)"
      )
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("start_date", { ascending: false }),
    supabase
      .from("campaigns")
      .select("id, name, status")
      .eq("organization_id", context.organizationId)
      .eq("status", "Active")
      .order("name", { ascending: true }),
    listContactActivity(contactId)
  ]);

  if (contactError) throw contactError;
  if (emailsError) throw emailsError;
  if (phonesError) throw phonesError;
  if (organizationsError) throw organizationsError;
  if (donationsError) throw donationsError;
  if (notesError) throw notesError;
  if (tasksError) throw tasksError;
  if (membershipsError) throw membershipsError;
  if (campaignsError) throw campaignsError;

  return {
    contact,
    emails: emails ?? [],
    phones: phones ?? [],
    organizations: organizations ?? [],
    donations: donations ?? [],
    notes: notes ?? [],
    tasks: tasks ?? [],
    memberships: memberships ?? [],
    campaigns: campaigns ?? [],
    activity,
    taskUrgency: taskUrgencyColor(tasks ?? [])
  };
}

export async function addDonationForContact(input: {
  contactId: string;
  date: string;
  totalAmount: number;
  paymentType: "Cash" | "Check" | "Card";
  allocations: Array<{ campaignId: string; amount: number }>;
  checkNumber?: string;
  transactionId?: string;
  memo?: string;
}) {
  await requireStaffPermission("can_create_donations");
  const id = await createDonationForStaff(input);

  await recordActivity({
    entityType: "donation",
    entityId: id,
    actionType: "created",
    actionSummary: `Added donation of $${input.totalAmount.toFixed(2)}`,
    relatedContactId: input.contactId
  });

  return id;
}

export async function addNoteForContact(input: {
  contactId: string;
  body: string;
  followUpRequired?: boolean;
  followUpAssignedToUserId?: string;
  followUpSuspenseDate?: string;
  followUpTaskDescription?: string;
}) {
  const context = await requireStaffPermission("can_create_notes");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notes")
    .insert({
      organization_id: context.organizationId,
      contact_id: input.contactId,
      note_type: "general",
      body: input.body,
      created_by: context.userId
    })
    .select("id")
    .single();

  if (error) throw error;

  await recordActivity({
    entityType: "note",
    entityId: data.id,
    actionType: "created",
    actionSummary: "Added contact note",
    relatedContactId: input.contactId
  });

  if (input.followUpRequired) {
    const taskId = await createTask({
      title: "Follow up required",
      description: input.followUpTaskDescription || input.body,
      suspenseDate: input.followUpSuspenseDate,
      assignedToUserId: input.followUpAssignedToUserId,
      contactId: input.contactId
    });

    await recordActivity({
      entityType: "task",
      entityId: taskId,
      actionType: "created_from_note",
      actionSummary: "Created follow-up task from note",
      relatedContactId: input.contactId
    });
  }

  return data.id;
}
