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
    message.includes("emergency_contact_phone") ||
    message.includes("entity_type") ||
    message.includes("tracking_status") ||
    message.includes("webconnex_id")
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

function isContactCustomFieldsSchemaError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return message.includes("contact_custom_field_values") || message.includes("contact_custom_fields");
}

function isVolunteerSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return message.includes("volunteer_profiles") || message.includes("volunteer_hours");
}

function isTaggingSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return (
    message.includes("contact_tags") ||
    message.includes("tags") ||
    message.includes("tag_assignment_job_results")
  );
}

function isMergeSchemaMissingError(error: unknown) {
  const message = String(
    (error as { message?: string; details?: string; hint?: string })?.message ??
      (error as { details?: string })?.details ??
      (error as { hint?: string })?.hint ??
      ""
  ).toLowerCase();
  return message.includes("contact_merge_history");
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLegacyContactClassification(record: Record<string, unknown>): Record<string, unknown> {
  const donorStatus = String(record.donor_status ?? "").toLowerCase();
  const organizationName = String(record.organization_name ?? "").trim();
  const externalSource = String(record.external_source ?? "").toLowerCase();
  const externalSourceId = String(record.external_source_id ?? "").trim();
  const hasGivingFuelExternalId =
    externalSourceId.length > 0 &&
    (externalSource === "givingfuel" || externalSource === "webconnex");
  const derivedEntityType = organizationName ? "organization" : "person";
  const derivedTrackingStatus = hasGivingFuelExternalId
    ? "donor"
    : donorStatus === "active" || donorStatus === "lapsed"
      ? "donor"
      : donorStatus === "inactive"
        ? "non_lead"
        : "lead";
  const derivedGivingFuelId = hasGivingFuelExternalId ? externalSourceId : null;

  return {
    ...record,
    entity_type: String(record.entity_type ?? "") || derivedEntityType,
    tracking_status: String(record.tracking_status ?? "") || derivedTrackingStatus,
    webconnex_id: String(record.webconnex_id ?? "") || derivedGivingFuelId,
    external_source: record.external_source ?? null,
    external_source_id: record.external_source_id ?? null
  };
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
    "id, organization_id, first_name, last_name, preferred_name, formal_letter_name, organization_name, entity_type, tracking_status, webconnex_id, external_source, external_source_id, donor_status, member_status, email, alternate_email, phone, mobile_number, alternate_phone, emergency_contact, emergency_contact_phone, communication_preferences, address_line_1, address_line_2, city, state, postal_code, mailing_address_line_1, mailing_address_line_2, mailing_city, mailing_state, mailing_postal_code, created_at, updated_at";
  const legacySelect =
    "id, organization_id, first_name, last_name, preferred_name, organization_name, donor_status, member_status, external_source, external_source_id, email, alternate_email, phone, alternate_phone, communication_preferences, address_line_1, address_line_2, city, state, postal_code, mailing_address_line_1, mailing_address_line_2, mailing_city, mailing_state, mailing_postal_code, created_at, updated_at";

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
        ? normalizeLegacyContactClassification({
            ...legacyResult.data,
            formal_letter_name: null,
            mobile_number: null,
            emergency_contact: null,
            emergency_contact_phone: null
          } as Record<string, unknown>)
        : null,
      error: null
    };
  }

  if (fullResult.data) {
    return {
      data: normalizeLegacyContactClassification(fullResult.data),
      error: fullResult.error
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
    activityLog,
    { data: tagAssignments, error: tagAssignmentsError },
    { data: tagAssignmentResults, error: tagAssignmentResultsError },
    { data: volunteerProfiles, error: volunteerProfilesError },
    { data: volunteerHours, error: volunteerHoursError },
    { data: mergeHistory, error: mergeHistoryError }
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
      .select("id, body, note_type, created_at, updated_at, created_by")
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false }),
    supabase
      .from("tasks")
      .select(
        "id, title, description, due_date, status, priority, assigned_to, completed_at, created_by, created_at, updated_at, project_id, projects(name)"
      )
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("due_date", { ascending: true }),
    supabase
      .from("memberships")
      .select(
        "id, status, level, start_date, end_date, renewal_date, created_by, created_at, updated_at, membership_types(name)"
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
    listContactActivity(contactId),
    supabase
      .from("contact_tags")
      .select("id, tag_id, assigned_at, assigned_by, assignment_source, notes, tags(name,path)")
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("assigned_at", { ascending: false }),
    supabase
      .from("tag_assignment_job_results")
      .select("id, action_taken, status, message, created_at, tag_id, tags(name,path)")
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("volunteer_profiles")
      .select("id, volunteer_status, volunteer_type, created_at, updated_at, created_by, updated_by")
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId),
    supabase
      .from("volunteer_hours")
      .select(
        "id, service_date, actual_hours, attendance_status, source, created_at, approved_at, volunteer_events(event_name)"
      )
      .eq("organization_id", context.organizationId)
      .eq("contact_id", contactId)
      .order("service_date", { ascending: false })
      .limit(200),
    supabase
      .from("contact_merge_history")
      .select("id, master_contact_id, duplicate_contact_id, merged_by, merged_at, merge_source")
      .eq("organization_id", context.organizationId)
      .or(`master_contact_id.eq.${contactId},duplicate_contact_id.eq.${contactId}`)
      .order("merged_at", { ascending: false })
      .limit(100)
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
  if (tagAssignmentsError && !isTaggingSchemaMissingError(tagAssignmentsError)) throw tagAssignmentsError;
  if (tagAssignmentResultsError && !isTaggingSchemaMissingError(tagAssignmentResultsError))
    throw tagAssignmentResultsError;
  if (volunteerProfilesError && !isVolunteerSchemaMissingError(volunteerProfilesError))
    throw volunteerProfilesError;
  if (volunteerHoursError && !isVolunteerSchemaMissingError(volunteerHoursError))
    throw volunteerHoursError;
  if (mergeHistoryError && !isMergeSchemaMissingError(mergeHistoryError)) throw mergeHistoryError;

  let customFields: Array<Record<string, unknown>> = [];
  const customFieldsResult = await supabase
    .from("contact_custom_field_values")
    .select(
      "value_text,contact_custom_fields(field_label,internal_key,display_order,data_type,is_active)"
    )
    .eq("organization_id", context.organizationId)
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });
  if (customFieldsResult.error) {
    if (!isContactCustomFieldsSchemaError(customFieldsResult.error)) {
      throw customFieldsResult.error;
    }
  } else {
    customFields = (customFieldsResult.data ?? [])
      .map((row) => {
        const field = Array.isArray(row.contact_custom_fields)
          ? row.contact_custom_fields[0]
          : row.contact_custom_fields;
        return {
          label: String((field as Record<string, unknown> | null)?.field_label ?? ""),
          internalKey: String((field as Record<string, unknown> | null)?.internal_key ?? ""),
          dataType: String((field as Record<string, unknown> | null)?.data_type ?? "text"),
          displayOrder: Number((field as Record<string, unknown> | null)?.display_order ?? 0),
          value: String(row.value_text ?? "")
        };
      })
      .filter((entry) => entry.label)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  const latestActivity = [
    ...(activityLog ?? []),
    ...(donations ?? []).map((donation) => ({
      id: `donation-${toText(donation.id)}`,
      entity_type: "donation",
      entity_id: donation.id,
      action_type: "donation_recorded",
      action_summary: `Donation recorded: $${Number(donation.amount ?? 0).toFixed(2)}${
        donation.donation_date ? ` on ${toText(donation.donation_date)}` : ""
      }`,
      created_at: toText(donation.updated_at) || toText(donation.created_at) || toText(donation.donation_date),
      performed_by_user_id: donation.created_by ?? null
    })),
    ...(notes ?? []).map((note) => ({
      id: `note-${toText(note.id)}`,
      entity_type: "note",
      entity_id: note.id,
      action_type: "note_logged",
      action_summary: `Note logged: ${toText(note.body).slice(0, 140)}`,
      created_at: toText(note.updated_at) || toText(note.created_at),
      performed_by_user_id: note.created_by ?? null
    })),
    ...(memberships ?? []).map((membership) => {
      const membershipType = Array.isArray(membership.membership_types)
        ? membership.membership_types[0]
        : membership.membership_types;
      return {
        id: `membership-${toText(membership.id)}`,
        entity_type: "membership",
        entity_id: membership.id,
        action_type: "membership_updated",
        action_summary: `Membership ${toText((membershipType as Record<string, unknown> | null)?.name) || "record"}: ${toText(
          membership.status
        ) || "-"}`,
        created_at:
          toText(membership.updated_at) || toText(membership.created_at) || toText(membership.start_date),
        performed_by_user_id: membership.created_by ?? null
      };
    }),
    ...(tagAssignments ?? []).map((assignment) => {
      const tag = Array.isArray(assignment.tags) ? assignment.tags[0] : assignment.tags;
      return {
        id: `contact-tag-${toText(assignment.id)}`,
        entity_type: "tag",
        entity_id: assignment.tag_id,
        action_type: "tag_assignment",
        action_summary: `Tag applied: ${toText((tag as Record<string, unknown> | null)?.path) || toText((tag as Record<string, unknown> | null)?.name) || "Tag"}`,
        created_at: toText(assignment.assigned_at),
        performed_by_user_id: assignment.assigned_by ?? null
      };
    }),
    ...(tagAssignmentResults ?? []).map((result) => {
      const tag = Array.isArray(result.tags) ? result.tags[0] : result.tags;
      const actionTaken = toText(result.action_taken) || "updated";
      return {
        id: `tag-result-${toText(result.id)}`,
        entity_type: "tag",
        entity_id: result.tag_id,
        action_type: `tag_${actionTaken}`,
        action_summary: `Tag ${actionTaken}: ${toText((tag as Record<string, unknown> | null)?.path) || toText((tag as Record<string, unknown> | null)?.name) || "Tag"}`,
        created_at: toText(result.created_at),
        performed_by_user_id: null
      };
    }),
    ...(volunteerProfiles ?? []).flatMap((profile) => {
      const base = {
        entity_type: "volunteer",
        entity_id: profile.id,
        performed_by_user_id: profile.updated_by ?? profile.created_by ?? null
      };
      const createdAt = toText(profile.created_at);
      const updatedAt = toText(profile.updated_at);
      const entries: Array<Record<string, unknown>> = [];
      if (createdAt) {
        entries.push({
          id: `volunteer-profile-created-${toText(profile.id)}`,
          ...base,
          action_type: "volunteer_profile_created",
          action_summary: `Volunteer profile created (${toText(profile.volunteer_status) || "status unknown"})`,
          created_at: createdAt
        });
      }
      if (updatedAt && updatedAt !== createdAt) {
        entries.push({
          id: `volunteer-profile-updated-${toText(profile.id)}`,
          ...base,
          action_type: "volunteer_profile_updated",
          action_summary: `Volunteer profile updated (${toText(profile.volunteer_status) || "status unknown"})`,
          created_at: updatedAt
        });
      }
      return entries;
    }),
    ...(volunteerHours ?? []).map((entry) => {
      const event = Array.isArray(entry.volunteer_events)
        ? entry.volunteer_events[0]
        : entry.volunteer_events;
      return {
        id: `volunteer-hours-${toText(entry.id)}`,
        entity_type: "volunteer",
        entity_id: entry.id,
        action_type: "volunteer_hours_logged",
        action_summary: `Volunteer hours logged: ${Number(entry.actual_hours ?? 0).toFixed(2)} hour(s)${
          toText((event as Record<string, unknown> | null)?.event_name)
            ? ` for ${toText((event as Record<string, unknown> | null)?.event_name)}`
            : ""
        }`,
        created_at: toText(entry.created_at) || toText(entry.approved_at) || toText(entry.service_date),
        performed_by_user_id: null
      };
    }),
    ...(mergeHistory ?? []).map((merge) => {
      const asMaster = toText(merge.master_contact_id) === contactId;
      return {
        id: `merge-${toText(merge.id)}`,
        entity_type: "merge",
        entity_id: merge.id,
        action_type: asMaster ? "contact_merged_into_master" : "contact_merged_as_duplicate",
        action_summary: asMaster
          ? `Contact merge completed. Another record was merged into this contact.`
          : `Contact merge completed. This record was merged into another contact.`,
        created_at: toText(merge.merged_at),
        performed_by_user_id: merge.merged_by ?? null
      };
    })
  ]
    .filter((entry) => toText(entry.created_at))
    .sort(
      (a, b) =>
        new Date(toText(b.created_at)).getTime() - new Date(toText(a.created_at)).getTime()
    )
    .slice(0, 400);

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
    customFields,
    activity: latestActivity,
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
  followUpTaskType?: "Call" | "Email" | "Mail" | "Other";
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
    const followUpTaskType = input.followUpTaskType ?? "Other";
    const followUpTaskDescription = (input.followUpTaskDescription ?? "").trim();
    const noteBody = (input.body ?? "").trim();
    const taskId = await createTask({
      title: `Follow Up - ${followUpTaskType}`,
      description: [
        `Follow-Up Type: ${followUpTaskType}`,
        `Follow-Up Task: ${followUpTaskDescription || "No task description provided."}`,
        `Original Note: ${noteBody || "-"}`
      ].join("\n"),
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
