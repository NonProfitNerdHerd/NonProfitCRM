import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { recordActivity, listContactActivity } from "@/lib/data/activity-log";
import { createTask } from "@/lib/data/tasks";

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
    supabase
      .from("contacts")
      .select("id, organization_id, first_name, last_name, preferred_name, email, phone, created_at")
      .eq("organization_id", context.organizationId)
      .eq("id", contactId)
      .maybeSingle(),
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
    supabase
      .from("donations")
      .select(
        "id, donation_date, amount, payment_type, check_number, transaction_id, memo, created_by, created_at, campaign_id, campaigns(name,status)"
      )
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("donation_date", { ascending: false }),
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
  campaignId: string;
  date: string;
  amount: number;
  paymentType: "Cash" | "Check" | "Card";
  checkNumber?: string;
  transactionId?: string;
  memo?: string;
}) {
  const context = await requireStaffPermission("can_create_donations");
  const supabase = await createClient();

  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, status")
    .eq("organization_id", context.organizationId)
    .eq("id", input.campaignId)
    .maybeSingle();
  if (campaignError) throw campaignError;
  if (!campaign || campaign.status !== "Active") {
    throw new Error("Donation must be tied to an active campaign.");
  }

  const { data, error } = await supabase
    .from("donations")
    .insert({
      organization_id: context.organizationId,
      contact_id: input.contactId,
      campaign_id: input.campaignId,
      amount: input.amount,
      currency: "USD",
      donation_date: input.date,
      status: "posted",
      payment_type: input.paymentType,
      check_number: input.checkNumber ?? null,
      transaction_id: input.transactionId ?? null,
      memo: input.memo ?? null,
      source: "manual",
      campaign: campaign.name,
      created_by: context.userId
    })
    .select("id")
    .single();

  if (error) throw error;

  await recordActivity({
    entityType: "donation",
    entityId: data.id,
    actionType: "created",
    actionSummary: `Added donation of $${input.amount.toFixed(2)}`,
    relatedContactId: input.contactId
  });

  return data.id;
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
