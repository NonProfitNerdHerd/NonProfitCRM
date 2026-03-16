import { createClient } from "@/lib/supabase/server";
import {
  hasAnyStaffPermission,
  requireVolunteerCoordinationAccess,
  requireVolunteerCoordinationManager,
  requireVolunteerSensitiveManager
} from "@/lib/auth/guards";
import { logAuditEvent } from "@/lib/data/audit";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseDate(value: unknown) {
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function parseTimestamp(value: unknown) {
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizePhone(value: unknown) {
  return toText(value).replace(/\D+/g, "");
}

type HourImportColumnMapping = {
  volunteerNameColumn?: string;
  contactIdentifierColumn?: string;
  roleColumn?: string;
  dateColumn?: string;
  checkInColumn?: string;
  checkOutColumn?: string;
  hoursColumn?: string;
  attendanceStatusColumn?: string;
  notesColumn?: string;
  contactMatchField?: "email" | "phone" | "external_source_id";
};

async function resolveContactForImportRow(input: {
  organizationId: string;
  row: Record<string, unknown>;
  mapping: HourImportColumnMapping;
}) {
  const supabase = await createClient();
  const identifierColumn = toText(input.mapping.contactIdentifierColumn);
  const field = input.mapping.contactMatchField ?? "email";

  if (identifierColumn) {
    const rawIdentifier = toText(input.row[identifierColumn]);
    if (rawIdentifier) {
      if (field === "email") {
        const { data } = await supabase
          .from("contacts")
          .select("id,first_name,last_name,organization_name")
          .eq("organization_id", input.organizationId)
          .ilike("email", rawIdentifier.toLowerCase())
          .limit(2);
        if ((data ?? []).length === 1) return data?.[0] ?? null;
        if ((data ?? []).length > 1) return { ambiguous: true };
      } else if (field === "external_source_id") {
        const { data } = await supabase
          .from("contacts")
          .select("id,first_name,last_name,organization_name")
          .eq("organization_id", input.organizationId)
          .ilike("external_source_id", rawIdentifier.toLowerCase())
          .limit(2);
        if ((data ?? []).length === 1) return data?.[0] ?? null;
        if ((data ?? []).length > 1) return { ambiguous: true };
      } else {
        const normalized = normalizePhone(rawIdentifier);
        if (normalized) {
          const { data } = await supabase
            .from("contacts")
            .select("id,first_name,last_name,organization_name,phone,mobile_number,alternate_phone")
            .eq("organization_id", input.organizationId)
            .limit(100);
          const matches = (data ?? []).filter((row) => {
            const fields = [
              normalizePhone(row.phone),
              normalizePhone((row as Record<string, unknown>).mobile_number),
              normalizePhone((row as Record<string, unknown>).alternate_phone)
            ];
            return fields.includes(normalized);
          });
          if (matches.length === 1) return matches[0];
          if (matches.length > 1) return { ambiguous: true };
        }
      }
    }
  }

  const nameColumn = toText(input.mapping.volunteerNameColumn);
  const fullName = toText(input.row[nameColumn]);
  if (!fullName) return null;
  const parts = fullName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ");
  if (!firstName || !lastName) return null;
  const { data } = await supabase
    .from("contacts")
    .select("id,first_name,last_name,organization_name")
    .eq("organization_id", input.organizationId)
    .ilike("first_name", firstName)
    .ilike("last_name", lastName)
    .limit(2);
  if ((data ?? []).length === 1) return data?.[0] ?? null;
  if ((data ?? []).length > 1) return { ambiguous: true };
  return null;
}

export async function getVolunteerCoordinationData(filters?: {
  volunteerStatus?: string;
  assignmentStatus?: string;
  eventType?: string;
  dateFrom?: string;
  dateTo?: string;
  burnoutOnly?: boolean;
  cautionOnly?: boolean;
  tagIds?: string[];
}) {
  const context = await requireVolunteerCoordinationAccess();
  const canViewSensitive = await hasAnyStaffPermission(
    ["can_view_volunteer_sensitive", "can_manage_volunteer_sensitive"],
    context
  );
  const supabase = await createClient();

  let volunteerQuery = supabase
    .from("volunteer_profiles")
    .select(
      "*, contacts(id,first_name,last_name,preferred_name,organization_name,email,phone,birthdate,entity_type,tracking_status)"
    )
    .eq("organization_id", context.organizationId)
    .order("updated_at", { ascending: false })
    .limit(300);
  if (toText(filters?.volunteerStatus)) {
    volunteerQuery = volunteerQuery.eq("volunteer_status", toText(filters?.volunteerStatus));
  }
  if (filters?.burnoutOnly) volunteerQuery = volunteerQuery.eq("burnout_flag", true);
  if (filters?.cautionOnly) volunteerQuery = volunteerQuery.or("caution_flag.eq.true,soft_blacklist_flag.eq.true");
  const { data: volunteers, error: volunteersError } = await volunteerQuery;
  if (volunteersError) throw volunteersError;

  let taggedContactIds = new Set<string>();
  if ((filters?.tagIds ?? []).length > 0) {
    const { data: taggedRows } = await supabase
      .from("contact_tags")
      .select("contact_id")
      .eq("organization_id", context.organizationId)
      .in("tag_id", filters?.tagIds ?? []);
    taggedContactIds = new Set((taggedRows ?? []).map((row) => String(row.contact_id)));
  }

  const filteredVolunteers = (volunteers ?? []).filter((row) => {
    if (taggedContactIds.size === 0) return true;
    return taggedContactIds.has(String(row.contact_id));
  });

  const activeVolunteerCount = filteredVolunteers.filter(
    (row) => toText(row.volunteer_status) === "active"
  ).length;
  const burnoutCount = filteredVolunteers.filter((row) => Boolean(row.burnout_flag)).length;
  const cautionCount = filteredVolunteers.filter(
    (row) => Boolean(row.caution_flag) || Boolean(row.soft_blacklist_flag)
  ).length;

  let eventsQuery = supabase
    .from("volunteer_events")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("event_date", { ascending: true })
    .limit(300);
  if (toText(filters?.eventType)) {
    eventsQuery = eventsQuery.eq("event_type", toText(filters?.eventType));
  }
  if (toText(filters?.dateFrom)) {
    eventsQuery = eventsQuery.gte("event_date", toText(filters?.dateFrom));
  }
  if (toText(filters?.dateTo)) {
    eventsQuery = eventsQuery.lte("event_date", toText(filters?.dateTo));
  }
  const { data: events, error: eventsError } = await eventsQuery;
  if (eventsError) throw eventsError;
  const eventIds = (events ?? []).map((row) => String(row.id));

  const { data: eventRoles, error: eventRolesError } = await supabase
    .from("volunteer_event_roles")
    .select("*")
    .eq("organization_id", context.organizationId)
    .in("event_id", eventIds.length > 0 ? eventIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: true });
  if (eventRolesError) throw eventRolesError;

  const { data: eventSeries, error: eventSeriesError } = await supabase
    .from("volunteer_event_series")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (eventSeriesError) throw eventSeriesError;

  let assignmentQuery = supabase
    .from("volunteer_assignments")
    .select("*, volunteer_profiles(contact_id), volunteer_events(event_name,event_date), volunteer_event_roles(role_name)")
    .eq("organization_id", context.organizationId)
    .order("assigned_at", { ascending: false })
    .limit(500);
  if (toText(filters?.assignmentStatus)) {
    assignmentQuery = assignmentQuery.eq("assignment_status", toText(filters?.assignmentStatus));
  }
  const { data: assignments, error: assignmentsError } = await assignmentQuery;
  if (assignmentsError) throw assignmentsError;

  const { data: waitlist, error: waitlistError } = await supabase
    .from("volunteer_waitlist_entries")
    .select("*, volunteer_event_roles(role_name), volunteer_events(event_name,event_date)")
    .eq("organization_id", context.organizationId)
    .order("waitlist_order", { ascending: true })
    .limit(500);
  if (waitlistError) throw waitlistError;

  const { data: substitutes, error: substitutesError } = await supabase
    .from("volunteer_substitute_entries")
    .select("*, volunteer_event_roles(role_name), volunteer_events(event_name,event_date)")
    .eq("organization_id", context.organizationId)
    .order("priority_order", { ascending: true })
    .limit(500);
  if (substitutesError) throw substitutesError;

  const { data: families, error: familiesError } = await supabase
    .from("volunteer_families")
    .select("*, volunteer_family_members(id,contact_id,role_in_family,is_primary_contact)")
    .eq("organization_id", context.organizationId)
    .order("family_name", { ascending: true })
    .limit(200);
  if (familiesError) throw familiesError;

  const { data: groups, error: groupsError } = await supabase
    .from("volunteer_groups")
    .select("*, volunteer_group_members(id,contact_id,display_name,is_placeholder,participation_status)")
    .eq("organization_id", context.organizationId)
    .order("group_name", { ascending: true })
    .limit(200);
  if (groupsError) throw groupsError;

  const { data: hourImports, error: hourImportsError } = await supabase
    .from("volunteer_hour_imports")
    .select("*, volunteer_events(event_name,event_date)")
    .eq("organization_id", context.organizationId)
    .order("imported_at", { ascending: false })
    .limit(100);
  if (hourImportsError) throw hourImportsError;

  const { data: contacts, error: contactsError } = await supabase
    .from("contacts_safe_view")
    .select("id,first_name,last_name,preferred_name,organization_name,email,phone,birthdate")
    .eq("organization_id", context.organizationId)
    .order("last_name", { ascending: true })
    .limit(600);
  if (contactsError) throw contactsError;

  const { data: tags, error: tagsError } = await supabase
    .from("tags")
    .select("id,name,path,module,is_active")
    .eq("organization_id", context.organizationId)
    .eq("module", "contacts")
    .eq("is_active", true)
    .order("path", { ascending: true });
  if (tagsError) throw tagsError;

  const { data: complianceItems } = canViewSensitive
    ? await supabase
        .from("volunteer_compliance_items")
        .select("*")
        .eq("organization_id", context.organizationId)
        .order("updated_at", { ascending: false })
        .limit(400)
    : { data: [] as Array<Record<string, unknown>> };

  const { data: concerns } = canViewSensitive
    ? await supabase
        .from("volunteer_concerns")
        .select("*")
        .eq("organization_id", context.organizationId)
        .order("concern_date", { ascending: false })
        .limit(300)
    : { data: [] as Array<Record<string, unknown>> };

  const { data: incidents } = canViewSensitive
    ? await supabase
        .from("volunteer_incidents")
        .select("*, volunteer_events(event_name,event_date), volunteer_event_roles(role_name)")
        .eq("organization_id", context.organizationId)
        .order("incident_at", { ascending: false })
        .limit(300)
    : { data: [] as Array<Record<string, unknown>> };

  const { data: burnoutFlags } = canViewSensitive
    ? await supabase
        .from("volunteer_burnout_flags")
        .select("*")
        .eq("organization_id", context.organizationId)
        .order("created_at", { ascending: false })
        .limit(300)
    : { data: [] as Array<Record<string, unknown>> };

  const currentYear = new Date().getUTCFullYear();
  const { data: monthlyHours } = await supabase
    .from("volunteer_hours")
    .select("service_date,actual_hours,event_id,attendance_status")
    .eq("organization_id", context.organizationId)
    .gte("service_date", `${currentYear}-01-01`)
    .lte("service_date", `${currentYear}-12-31`);

  const monthMap = new Map<string, number>();
  for (const row of monthlyHours ?? []) {
    if (toText(row.attendance_status) !== "completed") continue;
    const date = parseDate(row.service_date);
    if (!date) continue;
    const month = date.slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + toNumber(row.actual_hours));
  }
  const monthlyHoursReport = Array.from(monthMap.entries())
    .map(([month, hours]) => ({ month, hours: Math.round(hours * 100) / 100 }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const topVolunteers = [...filteredVolunteers]
    .sort((a, b) => toNumber(b.lifetime_hours) - toNumber(a.lifetime_hours))
    .slice(0, 20);

  const openRoles = (eventRoles ?? []).filter(
    (role) => toNumber(role.number_filled) < toNumber(role.number_needed)
  );

  const underfilledEvents = (events ?? [])
    .map((event) => ({
      ...event,
      fillGap: Math.max(0, toNumber(event.capacity_total) - toNumber(event.capacity_filled))
    }))
    .filter((event) => event.fillGap > 0);

  const noShowAssignments = (assignments ?? []).filter(
    (assignment) => toText(assignment.assignment_status) === "no_show"
  );

  const reportSummary = {
    totalVolunteers: filteredVolunteers.length,
    activeVolunteers: activeVolunteerCount,
    burnoutCount,
    cautionCount,
    totalEvents: (events ?? []).length,
    openRoles: openRoles.length,
    waitlistCount: (waitlist ?? []).length,
    substituteCount: (substitutes ?? []).length,
    noShowCount: noShowAssignments.length,
    incidentsCount: (incidents ?? []).length,
    concernsCount: (concerns ?? []).length
  };

  return {
    canViewSensitive,
    summary: reportSummary,
    volunteers: filteredVolunteers,
    events: events ?? [],
    eventSeries: eventSeries ?? [],
    eventRoles: eventRoles ?? [],
    assignments: assignments ?? [],
    waitlist: waitlist ?? [],
    substitutes: substitutes ?? [],
    families: families ?? [],
    groups: groups ?? [],
    complianceItems: complianceItems ?? [],
    concerns: concerns ?? [],
    incidents: incidents ?? [],
    burnoutFlags: burnoutFlags ?? [],
    hourImports: hourImports ?? [],
    contacts: contacts ?? [],
    tags: tags ?? [],
    reports: {
      monthlyHours: monthlyHoursReport,
      topVolunteers,
      underfilledEvents,
      noShowAssignments
    },
    options: {
      eventOptions: (events ?? []).map((event) => ({
        id: String(event.id),
        label: `${toText(event.event_name)} (${toText(event.event_date)})`
      })),
      roleOptions: (eventRoles ?? []).map((role) => ({
        id: String(role.id),
        eventId: String(role.event_id),
        label: toText(role.role_name)
      })),
      volunteerOptions: filteredVolunteers.map((volunteer) => {
        const contact = Array.isArray(volunteer.contacts) ? volunteer.contacts[0] : volunteer.contacts;
        const label =
          toText((contact as Record<string, unknown> | null)?.organization_name) ||
          `${toText((contact as Record<string, unknown> | null)?.first_name)} ${toText(
            (contact as Record<string, unknown> | null)?.last_name
          )}`.trim();
        return {
          id: String(volunteer.id),
          contactId: String(volunteer.contact_id),
          label: label || String(volunteer.contact_id)
        };
      })
    }
  };
}

export async function upsertVolunteerProfile(input: {
  id?: string;
  contactId: string;
  volunteerStatus: string;
  volunteerType: string;
  availabilityPreferences?: Record<string, unknown>;
  interests?: string[];
  skills?: string[];
  certifications?: string[];
  accommodations?: string | null;
  physicalLimitations?: string | null;
  transportationEligible?: boolean;
  driverEligible?: boolean;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  internalNotes?: string | null;
  internalConcerns?: string | null;
  burnoutFlag?: boolean;
  cautionFlag?: boolean;
  softBlacklistFlag?: boolean;
  doNotScheduleUntil?: string | null;
  guardianConsentStatus?: string;
  waiverSigned?: boolean;
  minorRequiresGuardianPresent?: boolean;
  backgroundCheckStatus?: string;
  backgroundCheckExpiresAt?: string | null;
  orientationCompletedAt?: string | null;
  confidentialityAcknowledgedAt?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    contact_id: input.contactId,
    volunteer_status: toText(input.volunteerStatus) || "prospective",
    volunteer_type: toText(input.volunteerType) || "individual",
    availability_preferences: input.availabilityPreferences ?? {},
    interests: input.interests ?? [],
    skills: input.skills ?? [],
    certifications: input.certifications ?? [],
    accommodations: toText(input.accommodations) || null,
    physical_limitations: toText(input.physicalLimitations) || null,
    transportation_eligible: Boolean(input.transportationEligible),
    driver_eligible: Boolean(input.driverEligible),
    emergency_contact_name: toText(input.emergencyContactName) || null,
    emergency_contact_phone: toText(input.emergencyContactPhone) || null,
    internal_notes: toText(input.internalNotes) || null,
    internal_concerns: toText(input.internalConcerns) || null,
    burnout_flag: Boolean(input.burnoutFlag),
    caution_flag: Boolean(input.cautionFlag),
    soft_blacklist_flag: Boolean(input.softBlacklistFlag),
    do_not_schedule_until: parseDate(input.doNotScheduleUntil),
    guardian_consent_status: toText(input.guardianConsentStatus) || "not_required",
    waiver_signed: Boolean(input.waiverSigned),
    minor_requires_guardian_present: Boolean(input.minorRequiresGuardianPresent),
    background_check_status: toText(input.backgroundCheckStatus) || "pending",
    background_check_expires_at: parseDate(input.backgroundCheckExpiresAt),
    orientation_completed_at: parseDate(input.orientationCompletedAt),
    confidentiality_acknowledged_at: parseDate(input.confidentialityAcknowledgedAt),
    updated_by: context.userId
  };

  let data: Record<string, unknown> | null = null;
  if (toText(input.id)) {
    const response = await supabase
      .from("volunteer_profiles")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  } else {
    const response = await supabase
      .from("volunteer_profiles")
      .upsert(
        {
          ...payload,
          created_by: context.userId
        },
        { onConflict: "organization_id,contact_id" }
      )
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_profile_upserted",
    targetEntityType: "volunteer_profiles",
    targetEntityId: toText(data?.id),
    metadata: {
      contactId: input.contactId,
      volunteerStatus: payload.volunteer_status,
      volunteerType: payload.volunteer_type
    }
  });

  return data;
}

export async function upsertVolunteerEvent(input: {
  id?: string;
  eventName: string;
  eventType?: string | null;
  programDepartment?: string | null;
  eventStatus?: string;
  eventDescription?: string | null;
  eventDate: string;
  startTime: string;
  endTime: string;
  location?: string | null;
  coordinatorUserId?: string | null;
  visibility?: string;
  capacityTotal?: number;
  notes?: string | null;
  mealOptions?: string[];
  tshirtOptions?: string[];
  familyFriendly?: boolean;
  groupAllowed?: boolean;
  minorAllowed?: boolean;
  seriesId?: string | null;
  isSeriesOverride?: boolean;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    series_id: toText(input.seriesId) || null,
    event_name: toText(input.eventName),
    event_type: toText(input.eventType) || null,
    program_department: toText(input.programDepartment) || null,
    event_status: toText(input.eventStatus) || "draft",
    event_description: toText(input.eventDescription) || null,
    event_date: parseDate(input.eventDate),
    start_time: toText(input.startTime),
    end_time: toText(input.endTime),
    location: toText(input.location) || null,
    coordinator_user_id: toText(input.coordinatorUserId) || null,
    visibility: toText(input.visibility) || "internal",
    capacity_total: Math.max(0, toNumber(input.capacityTotal)),
    notes: toText(input.notes) || null,
    meal_options: input.mealOptions ?? [],
    tshirt_options: input.tshirtOptions ?? [],
    family_friendly: Boolean(input.familyFriendly),
    group_allowed: Boolean(input.groupAllowed),
    minor_allowed: Boolean(input.minorAllowed),
    is_series_override: Boolean(input.isSeriesOverride),
    updated_by: context.userId
  };

  let data: Record<string, unknown> | null = null;
  if (toText(input.id)) {
    const response = await supabase
      .from("volunteer_events")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  } else {
    const response = await supabase
      .from("volunteer_events")
      .insert({
        ...payload,
        created_by: context.userId
      })
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_event_upserted",
    targetEntityType: "volunteer_events",
    targetEntityId: toText(data?.id),
    metadata: {
      eventName: payload.event_name,
      eventDate: payload.event_date,
      status: payload.event_status
    }
  });

  return data;
}

export async function createVolunteerEventSeries(input: {
  seriesName: string;
  recurrencePattern: string;
  recurrenceInterval?: number;
  recurrenceDaysOfWeek?: number[];
  recurrenceDayOfMonth?: number | null;
  startsOn: string;
  endsOn?: string | null;
  endsAfterOccurrences?: number | null;
  timezone?: string;
  notes?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("volunteer_event_series")
    .insert({
      organization_id: context.organizationId,
      series_name: toText(input.seriesName),
      recurrence_pattern: toText(input.recurrencePattern) || "weekly",
      recurrence_interval: Math.max(1, toNumber(input.recurrenceInterval, 1)),
      recurrence_days_of_week: input.recurrenceDaysOfWeek ?? [],
      recurrence_day_of_month: input.recurrenceDayOfMonth ?? null,
      starts_on: parseDate(input.startsOn),
      ends_on: parseDate(input.endsOn),
      ends_after_occurrences:
        input.endsAfterOccurrences !== null && input.endsAfterOccurrences !== undefined
          ? Math.max(1, toNumber(input.endsAfterOccurrences, 1))
          : null,
      timezone: toText(input.timezone) || "UTC",
      notes: toText(input.notes) || null,
      created_by: context.userId,
      updated_by: context.userId
    })
    .select("*")
    .single();
  if (error) throw error;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_event_series_created",
    targetEntityType: "volunteer_event_series",
    targetEntityId: toText(data.id),
    metadata: {
      seriesName: data.series_name,
      recurrencePattern: data.recurrence_pattern
    }
  });

  return data as Record<string, unknown>;
}

export async function upsertVolunteerRole(input: {
  id?: string;
  eventId: string;
  parentRoleId?: string | null;
  roleName: string;
  roleDescription?: string | null;
  shiftStart?: string | null;
  shiftEnd?: string | null;
  numberNeeded?: number;
  waitlistEnabled?: boolean;
  substituteEnabled?: boolean;
  isLeadRole?: boolean;
  requiredSkills?: string[];
  requiredTags?: string[];
  requiredCertifications?: string[];
  requiredTraining?: string[];
  backgroundCheckRequired?: boolean;
  driverEligibilityRequired?: boolean;
  minorAllowed?: boolean;
  familyMemberAllowed?: boolean;
  groupParticipantAllowed?: boolean;
  physicalRequirements?: string | null;
  mealEligible?: boolean;
  tshirtEligible?: boolean;
  checkInLocation?: string | null;
  supervisorContactId?: string | null;
  notes?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    event_id: input.eventId,
    parent_role_id: toText(input.parentRoleId) || null,
    role_name: toText(input.roleName),
    role_description: toText(input.roleDescription) || null,
    shift_start: toText(input.shiftStart) || null,
    shift_end: toText(input.shiftEnd) || null,
    number_needed: Math.max(1, toNumber(input.numberNeeded, 1)),
    waitlist_enabled: input.waitlistEnabled !== false,
    substitute_enabled: input.substituteEnabled !== false,
    is_lead_role: Boolean(input.isLeadRole),
    required_skills: input.requiredSkills ?? [],
    required_tags: input.requiredTags ?? [],
    required_certifications: input.requiredCertifications ?? [],
    required_training: input.requiredTraining ?? [],
    background_check_required: Boolean(input.backgroundCheckRequired),
    driver_eligibility_required: Boolean(input.driverEligibilityRequired),
    minor_allowed: input.minorAllowed !== false,
    family_member_allowed: input.familyMemberAllowed !== false,
    group_participant_allowed: input.groupParticipantAllowed !== false,
    physical_requirements: toText(input.physicalRequirements) || null,
    meal_eligible: Boolean(input.mealEligible),
    tshirt_eligible: Boolean(input.tshirtEligible),
    check_in_location: toText(input.checkInLocation) || null,
    supervisor_contact_id: toText(input.supervisorContactId) || null,
    notes: toText(input.notes) || null,
    updated_by: context.userId
  };

  let data: Record<string, unknown> | null = null;
  if (toText(input.id)) {
    const response = await supabase
      .from("volunteer_event_roles")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  } else {
    const response = await supabase
      .from("volunteer_event_roles")
      .insert({
        ...payload,
        created_by: context.userId
      })
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_event_role_upserted",
    targetEntityType: "volunteer_event_roles",
    targetEntityId: toText(data?.id),
    metadata: {
      eventId: input.eventId,
      roleName: payload.role_name
    }
  });

  return data;
}

export async function upsertVolunteerAssignment(input: {
  id?: string;
  volunteerProfileId: string;
  eventId: string;
  roleId?: string | null;
  familyId?: string | null;
  groupId?: string | null;
  assignmentStatus: string;
  scheduledHours?: number | null;
  actualHours?: number | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  approvalStatus?: string;
  isLateArrival?: boolean;
  isEarlyDeparture?: boolean;
  lateCancelled?: boolean;
  notes?: string | null;
  noShowReason?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    volunteer_profile_id: input.volunteerProfileId,
    event_id: input.eventId,
    role_id: toText(input.roleId) || null,
    family_id: toText(input.familyId) || null,
    group_id: toText(input.groupId) || null,
    assignment_status: toText(input.assignmentStatus) || "invited",
    scheduled_hours:
      input.scheduledHours === null || input.scheduledHours === undefined
        ? null
        : Math.max(0, toNumber(input.scheduledHours)),
    actual_hours:
      input.actualHours === null || input.actualHours === undefined
        ? null
        : Math.max(0, toNumber(input.actualHours)),
    check_in_at: parseTimestamp(input.checkInAt),
    check_out_at: parseTimestamp(input.checkOutAt),
    approval_status: toText(input.approvalStatus) || "pending",
    is_late_arrival: Boolean(input.isLateArrival),
    is_early_departure: Boolean(input.isEarlyDeparture),
    late_cancelled: Boolean(input.lateCancelled),
    notes: toText(input.notes) || null,
    no_show_reason: toText(input.noShowReason) || null
  };

  let data: Record<string, unknown> | null = null;
  if (toText(input.id)) {
    const response = await supabase
      .from("volunteer_assignments")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  } else {
    const response = await supabase
      .from("volunteer_assignments")
      .insert({
        ...payload,
        assigned_by: context.userId
      })
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_assignment_upserted",
    targetEntityType: "volunteer_assignments",
    targetEntityId: toText(data?.id),
    metadata: {
      volunteerProfileId: input.volunteerProfileId,
      eventId: input.eventId,
      roleId: payload.role_id,
      status: payload.assignment_status
    }
  });

  return data;
}

export async function upsertWaitlistEntry(input: {
  id?: string;
  eventId: string;
  roleId: string;
  volunteerProfileId: string;
  waitlistOrder?: number;
  entryStatus?: string;
  notes?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    event_id: input.eventId,
    role_id: input.roleId,
    volunteer_profile_id: input.volunteerProfileId,
    waitlist_order: Math.max(1, toNumber(input.waitlistOrder, 1)),
    entry_status: toText(input.entryStatus) || "waiting",
    notes: toText(input.notes) || null
  };

  const response = toText(input.id)
    ? await supabase
        .from("volunteer_waitlist_entries")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("id", toText(input.id))
        .select("*")
        .single()
    : await supabase
        .from("volunteer_waitlist_entries")
        .upsert(
          {
            ...payload,
            created_by: context.userId
          },
          { onConflict: "event_id,role_id,volunteer_profile_id" }
        )
        .select("*")
        .single();
  if (response.error) throw response.error;
  return response.data as Record<string, unknown>;
}

export async function upsertSubstituteEntry(input: {
  id?: string;
  eventId: string;
  roleId?: string | null;
  volunteerProfileId: string;
  availabilityStatus?: string;
  priorityOrder?: number;
  notes?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    event_id: input.eventId,
    role_id: toText(input.roleId) || null,
    volunteer_profile_id: input.volunteerProfileId,
    availability_status: toText(input.availabilityStatus) || "available",
    priority_order: Math.max(1, toNumber(input.priorityOrder, 1)),
    notes: toText(input.notes) || null
  };

  const response = toText(input.id)
    ? await supabase
        .from("volunteer_substitute_entries")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("id", toText(input.id))
        .select("*")
        .single()
    : await supabase
        .from("volunteer_substitute_entries")
        .upsert(
          {
            ...payload,
            created_by: context.userId
          },
          { onConflict: "event_id,role_id,volunteer_profile_id" }
        )
        .select("*")
        .single();
  if (response.error) throw response.error;
  return response.data as Record<string, unknown>;
}

export async function upsertVolunteerFamily(input: {
  id?: string;
  familyName: string;
  mustServeTogether?: boolean;
  notes?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    family_name: toText(input.familyName),
    must_serve_together: Boolean(input.mustServeTogether),
    notes: toText(input.notes) || null,
    created_by: context.userId
  };

  const response = toText(input.id)
    ? await supabase
        .from("volunteer_families")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("id", toText(input.id))
        .select("*")
        .single()
    : await supabase.from("volunteer_families").insert(payload).select("*").single();
  if (response.error) throw response.error;
  return response.data as Record<string, unknown>;
}

export async function upsertVolunteerFamilyMember(input: {
  familyId: string;
  contactId: string;
  roleInFamily?: string | null;
  isPrimaryContact?: boolean;
  notes?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("volunteer_family_members")
    .upsert(
      {
        organization_id: context.organizationId,
        family_id: input.familyId,
        contact_id: input.contactId,
        role_in_family: toText(input.roleInFamily) || null,
        is_primary_contact: Boolean(input.isPrimaryContact),
        notes: toText(input.notes) || null
      },
      { onConflict: "family_id,contact_id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function upsertVolunteerGroup(input: {
  id?: string;
  groupName: string;
  groupType?: string | null;
  groupStatus?: string;
  coordinatorContactId?: string | null;
  estimatedAttendance?: number;
  confirmedAttendance?: number;
  notes?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    group_name: toText(input.groupName),
    group_type: toText(input.groupType) || "community",
    group_status: toText(input.groupStatus) || "active",
    coordinator_contact_id: toText(input.coordinatorContactId) || null,
    estimated_attendance: Math.max(0, toNumber(input.estimatedAttendance)),
    confirmed_attendance: Math.max(0, toNumber(input.confirmedAttendance)),
    notes: toText(input.notes) || null,
    created_by: context.userId
  };

  const response = toText(input.id)
    ? await supabase
        .from("volunteer_groups")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("id", toText(input.id))
        .select("*")
        .single()
    : await supabase.from("volunteer_groups").insert(payload).select("*").single();
  if (response.error) throw response.error;
  return response.data as Record<string, unknown>;
}

export async function upsertVolunteerGroupMember(input: {
  groupId: string;
  contactId?: string | null;
  displayName?: string | null;
  isPlaceholder?: boolean;
  participationStatus?: string;
  notes?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    group_id: input.groupId,
    contact_id: toText(input.contactId) || null,
    display_name: toText(input.displayName) || null,
    is_placeholder: Boolean(input.isPlaceholder),
    participation_status: toText(input.participationStatus) || "estimated",
    notes: toText(input.notes) || null
  };

  const { data, error } = await supabase.from("volunteer_group_members").insert(payload).select("*").single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function upsertVolunteerComplianceItem(input: {
  id?: string;
  volunteerProfileId: string;
  complianceType: string;
  complianceStatus: string;
  completedAt?: string | null;
  expiresAt?: string | null;
  requiredForRoles?: string[];
  notes?: string | null;
}) {
  const context = await requireVolunteerSensitiveManager();
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    volunteer_profile_id: input.volunteerProfileId,
    compliance_type: toText(input.complianceType),
    compliance_status: toText(input.complianceStatus) || "pending",
    completed_at: parseDate(input.completedAt),
    expires_at: parseDate(input.expiresAt),
    required_for_roles: input.requiredForRoles ?? [],
    notes: toText(input.notes) || null,
    created_by: context.userId,
    verified_by: context.userId
  };

  const response = toText(input.id)
    ? await supabase
        .from("volunteer_compliance_items")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("id", toText(input.id))
        .select("*")
        .single()
    : await supabase.from("volunteer_compliance_items").insert(payload).select("*").single();
  if (response.error) throw response.error;
  return response.data as Record<string, unknown>;
}

export async function upsertVolunteerConcern(input: {
  id?: string;
  volunteerProfileId: string;
  concernCategory: string;
  concernType: string;
  severity: string;
  concernDate?: string | null;
  reviewStatus?: string;
  actionLevel?: string;
  roleRestrictions?: string[];
  eventRestrictions?: string[];
  notes?: string | null;
  internalReviewNotes?: string | null;
}) {
  const context = await requireVolunteerSensitiveManager();
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    volunteer_profile_id: input.volunteerProfileId,
    concern_category: toText(input.concernCategory),
    concern_type: toText(input.concernType),
    severity: toText(input.severity) || "medium",
    concern_date: parseDate(input.concernDate) ?? new Date().toISOString().slice(0, 10),
    review_status: toText(input.reviewStatus) || "open",
    action_level: toText(input.actionLevel) || "caution_only",
    role_restrictions: input.roleRestrictions ?? [],
    event_restrictions: input.eventRestrictions ?? [],
    notes: toText(input.notes) || null,
    internal_review_notes: toText(input.internalReviewNotes) || null,
    reviewed_by: context.userId,
    reviewed_at: new Date().toISOString(),
    created_by: context.userId
  };

  const response = toText(input.id)
    ? await supabase
        .from("volunteer_concerns")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("id", toText(input.id))
        .select("*")
        .single()
    : await supabase.from("volunteer_concerns").insert(payload).select("*").single();
  if (response.error) throw response.error;

  await supabase
    .from("volunteer_profiles")
    .update({
      caution_flag: ["caution_only", "role_restricted", "event_restricted"].includes(payload.action_level),
      soft_blacklist_flag: payload.action_level === "soft_blacklisted",
      volunteer_status:
        payload.action_level === "soft_blacklisted"
          ? "soft_blacklisted"
          : payload.action_level === "temporarily_do_not_schedule"
            ? "do_not_schedule"
            : undefined,
      do_not_schedule_until:
        payload.action_level === "temporarily_do_not_schedule"
          ? new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString().slice(0, 10)
          : undefined
    })
    .eq("organization_id", context.organizationId)
    .eq("id", input.volunteerProfileId);

  return response.data as Record<string, unknown>;
}

export async function upsertVolunteerBurnoutFlag(input: {
  id?: string;
  volunteerProfileId: string;
  flagType?: string;
  status?: string;
  pauseDays?: number | null;
  pauseUntil?: string | null;
  reason?: string | null;
}) {
  const context = await requireVolunteerSensitiveManager();
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    volunteer_profile_id: input.volunteerProfileId,
    flag_type: toText(input.flagType) || "manual",
    status: toText(input.status) || "active",
    pause_days:
      input.pauseDays === null || input.pauseDays === undefined ? null : Math.max(1, toNumber(input.pauseDays)),
    pause_until: parseDate(input.pauseUntil),
    reason: toText(input.reason) || null,
    created_by: context.userId,
    reviewed_by: context.userId
  };

  const response = toText(input.id)
    ? await supabase
        .from("volunteer_burnout_flags")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("id", toText(input.id))
        .select("*")
        .single()
    : await supabase.from("volunteer_burnout_flags").insert(payload).select("*").single();
  if (response.error) throw response.error;

  await supabase
    .from("volunteer_profiles")
    .update({
      burnout_flag: payload.status === "active",
      do_not_schedule_until:
        payload.status === "paused"
          ? payload.pause_until ??
            (payload.pause_days
              ? new Date(Date.now() + payload.pause_days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
              : null)
          : undefined
    })
    .eq("organization_id", context.organizationId)
    .eq("id", input.volunteerProfileId);

  return response.data as Record<string, unknown>;
}

export async function upsertVolunteerIncident(input: {
  id?: string;
  eventId?: string | null;
  roleId?: string | null;
  assignmentId?: string | null;
  incidentAt?: string | null;
  incidentCategory: string;
  severity: string;
  description: string;
  witnesses?: string | null;
  actionTaken?: string | null;
  followUpRequired?: boolean;
  followUpNotes?: string | null;
  resolved?: boolean;
  internalOnly?: boolean;
  attachmentUrls?: string[];
  incidentPeople?: Array<{
    volunteerProfileId?: string | null;
    contactId?: string | null;
    involvementType?: string;
    notes?: string | null;
  }>;
}) {
  const context = await requireVolunteerSensitiveManager();
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    event_id: toText(input.eventId) || null,
    role_id: toText(input.roleId) || null,
    assignment_id: toText(input.assignmentId) || null,
    incident_at: parseTimestamp(input.incidentAt) ?? new Date().toISOString(),
    incident_category: toText(input.incidentCategory),
    severity: toText(input.severity) || "medium",
    description: toText(input.description),
    witnesses: toText(input.witnesses) || null,
    action_taken: toText(input.actionTaken) || null,
    follow_up_required: Boolean(input.followUpRequired),
    follow_up_notes: toText(input.followUpNotes) || null,
    resolved: Boolean(input.resolved),
    resolved_at: input.resolved ? new Date().toISOString() : null,
    resolved_by: input.resolved ? context.userId : null,
    internal_only: input.internalOnly !== false,
    attachment_urls: input.attachmentUrls ?? [],
    updated_by: context.userId
  };

  const response = toText(input.id)
    ? await supabase
        .from("volunteer_incidents")
        .update(payload)
        .eq("organization_id", context.organizationId)
        .eq("id", toText(input.id))
        .select("*")
        .single()
    : await supabase
        .from("volunteer_incidents")
        .insert({
          ...payload,
          created_by: context.userId
        })
        .select("*")
        .single();
  if (response.error) throw response.error;

  const incidentId = String(response.data.id);
  if (Array.isArray(input.incidentPeople)) {
    await supabase
      .from("volunteer_incident_people")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("incident_id", incidentId);

    const personRows = input.incidentPeople
      .filter((row) => toText(row.volunteerProfileId) || toText(row.contactId))
      .map((row) => ({
        organization_id: context.organizationId,
        incident_id: incidentId,
        volunteer_profile_id: toText(row.volunteerProfileId) || null,
        contact_id: toText(row.contactId) || null,
        involvement_type: toText(row.involvementType) || "subject",
        notes: toText(row.notes) || null
      }));
    if (personRows.length > 0) {
      const { error: peopleError } = await supabase.from("volunteer_incident_people").insert(personRows);
      if (peopleError) throw peopleError;
    }
  }

  return response.data as Record<string, unknown>;
}

export async function stageVolunteerHourImport(input: {
  eventId: string;
  sourceFilename: string;
  columnMapping: HourImportColumnMapping;
  rows: Array<Record<string, unknown>>;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const mapping = input.columnMapping;

  const { data: importRecord, error: importError } = await supabase
    .from("volunteer_hour_imports")
    .insert({
      organization_id: context.organizationId,
      event_id: input.eventId,
      import_status: "staged",
      source_filename: toText(input.sourceFilename) || "uploaded.csv",
      imported_by: context.userId,
      rows_staged: input.rows.length,
      mapping_configuration: mapping
    })
    .select("*")
    .single();
  if (importError) throw importError;

  let stagedCount = 0;
  let errorCount = 0;
  let unmatchedCount = 0;
  const stagedRows: Array<Record<string, unknown>> = [];

  for (const [index, row] of input.rows.entries()) {
    const rowIndex = index + 1;
    let stageStatus = "pending";
    let errorMessage: string | null = null;
    let matchedContactId: string | null = null;
    let matchedVolunteerProfileId: string | null = null;

    const resolvedContact = await resolveContactForImportRow({
      organizationId: context.organizationId,
      row,
      mapping
    });

    if (resolvedContact && "ambiguous" in resolvedContact) {
      stageStatus = "error";
      errorMessage = "Multiple contacts matched this row.";
      errorCount += 1;
    } else if (resolvedContact && "id" in resolvedContact) {
      matchedContactId = String(resolvedContact.id);
      const { data: volunteerProfile } = await supabase
        .from("volunteer_profiles")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("contact_id", matchedContactId)
        .maybeSingle();
      matchedVolunteerProfileId = volunteerProfile?.id ? String(volunteerProfile.id) : null;
      stageStatus = matchedVolunteerProfileId ? "matched" : "unmatched";
      if (!matchedVolunteerProfileId) unmatchedCount += 1;
    } else {
      stageStatus = "unmatched";
      unmatchedCount += 1;
    }

    const serviceDate = parseDate(row[toText(mapping.dateColumn)]);
    const rawHours = toText(row[toText(mapping.hoursColumn)]);
    const hours = rawHours ? Number(rawHours.replace(/[,\s]/g, "")) : null;

    const rowPayload = {
      organization_id: context.organizationId,
      import_id: String(importRecord.id),
      row_index: rowIndex,
      raw_row: row,
      matched_contact_id: matchedContactId,
      matched_volunteer_profile_id: matchedVolunteerProfileId,
      role_name: toText(row[toText(mapping.roleColumn)]) || null,
      service_date: serviceDate,
      check_in_at: parseTimestamp(row[toText(mapping.checkInColumn)]),
      check_out_at: parseTimestamp(row[toText(mapping.checkOutColumn)]),
      hours: Number.isFinite(hours as number) ? Math.max(0, Number(hours)) : null,
      attendance_status: toText(row[toText(mapping.attendanceStatusColumn)]) || "completed",
      notes: toText(row[toText(mapping.notesColumn)]) || null,
      stage_status: stageStatus,
      error_message: errorMessage
    };
    const { data: stagedRow, error: stagedRowError } = await supabase
      .from("volunteer_hour_import_rows")
      .insert(rowPayload)
      .select("*")
      .single();
    if (stagedRowError) throw stagedRowError;
    stagedRows.push(stagedRow as Record<string, unknown>);
    stagedCount += 1;
  }

  const { error: updateImportError } = await supabase
    .from("volunteer_hour_imports")
    .update({
      rows_staged: stagedCount,
      rows_error: errorCount,
      rows_skipped: unmatchedCount,
      import_status: "staged"
    })
    .eq("organization_id", context.organizationId)
    .eq("id", String(importRecord.id));
  if (updateImportError) throw updateImportError;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_hours_import_staged",
    targetEntityType: "volunteer_hour_imports",
    targetEntityId: String(importRecord.id),
    metadata: {
      eventId: input.eventId,
      filename: input.sourceFilename,
      rowsStaged: stagedCount,
      rowsError: errorCount,
      rowsUnmatched: unmatchedCount
    }
  });

  return {
    import: importRecord,
    rows: stagedRows,
    summary: {
      stagedCount,
      errorCount,
      unmatchedCount
    }
  };
}

export async function updateVolunteerHourImportRow(input: {
  importRowId: string;
  matchedContactId?: string | null;
  matchedVolunteerProfileId?: string | null;
  stageStatus?: string;
  errorMessage?: string | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const updates: Record<string, unknown> = {};
  if (input.matchedContactId !== undefined) {
    updates.matched_contact_id = toText(input.matchedContactId) || null;
  }
  if (input.matchedVolunteerProfileId !== undefined) {
    updates.matched_volunteer_profile_id = toText(input.matchedVolunteerProfileId) || null;
  }
  if (input.stageStatus !== undefined) {
    updates.stage_status = toText(input.stageStatus) || "pending";
  }
  if (input.errorMessage !== undefined) {
    updates.error_message = toText(input.errorMessage) || null;
  }

  const { data, error } = await supabase
    .from("volunteer_hour_import_rows")
    .update(updates)
    .eq("organization_id", context.organizationId)
    .eq("id", input.importRowId)
    .select("*")
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

export async function commitVolunteerHourImport(input: { importId: string }) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const { data: importRecord, error: importError } = await supabase
    .from("volunteer_hour_imports")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", input.importId)
    .single();
  if (importError) throw importError;

  const { data: rows, error: rowsError } = await supabase
    .from("volunteer_hour_import_rows")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("import_id", input.importId)
    .order("row_index", { ascending: true });
  if (rowsError) throw rowsError;

  let committed = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows ?? []) {
    try {
      let matchedVolunteerProfileId = toText(row.matched_volunteer_profile_id);
      const matchedContactId = toText(row.matched_contact_id);
      if (!matchedVolunteerProfileId && matchedContactId) {
        const { data: createdProfile, error: createProfileError } = await supabase
          .from("volunteer_profiles")
          .upsert(
            {
              organization_id: context.organizationId,
              contact_id: matchedContactId,
              volunteer_status: "active",
              volunteer_type: "individual",
              created_by: context.userId,
              updated_by: context.userId
            } as unknown as Record<string, unknown>,
            { onConflict: "organization_id,contact_id" }
          )
          .select("id")
          .single();
        if (createProfileError) throw createProfileError;
        matchedVolunteerProfileId = toText(createdProfile.id);
      }

      if (!matchedVolunteerProfileId || !matchedContactId) {
        skipped += 1;
        await supabase
          .from("volunteer_hour_import_rows")
          .update({
            stage_status: "skipped",
            error_message: "Row could not be matched to a volunteer profile/contact."
          })
          .eq("organization_id", context.organizationId)
          .eq("id", String(row.id));
        continue;
      }

      const roleName = toText(row.role_name);
      let roleId: string | null = null;
      if (roleName) {
        const { data: role } = await supabase
          .from("volunteer_event_roles")
          .select("id")
          .eq("organization_id", context.organizationId)
          .eq("event_id", String(importRecord.event_id))
          .ilike("role_name", roleName)
          .maybeSingle();
        roleId = role?.id ? String(role.id) : null;
      }

      let assignmentId: string | null = toText(row.matched_assignment_id) || null;
      if (!assignmentId) {
        const { data: assignment, error: assignmentError } = await supabase
          .from("volunteer_assignments")
          .upsert(
            {
              organization_id: context.organizationId,
              volunteer_profile_id: matchedVolunteerProfileId,
              event_id: String(importRecord.event_id),
              role_id: roleId,
              assignment_status:
                toText(row.attendance_status).toLowerCase() === "no_show" ? "no_show" : "completed",
              approval_status: "approved",
              assigned_by: context.userId,
              assigned_at: new Date().toISOString(),
              actual_hours: toNumber(row.hours),
              check_in_at: row.check_in_at ?? null,
              check_out_at: row.check_out_at ?? null,
              completed_at: new Date().toISOString(),
              notes: toText(row.notes) || null
            },
            { onConflict: "id" }
          )
          .select("id")
          .single();
        if (assignmentError) throw assignmentError;
        assignmentId = String(assignment.id);
      }

      const { error: hourError } = await supabase.from("volunteer_hours").insert({
        organization_id: context.organizationId,
        volunteer_profile_id: matchedVolunteerProfileId,
        contact_id: matchedContactId,
        event_id: String(importRecord.event_id),
        role_id: roleId,
        assignment_id: assignmentId,
        service_date: row.service_date ?? parseDate(new Date()),
        check_in_at: row.check_in_at ?? null,
        check_out_at: row.check_out_at ?? null,
        scheduled_hours: toNumber(row.hours),
        actual_hours: Math.max(0, toNumber(row.hours)),
        attendance_status: toText(row.attendance_status) || "completed",
        source: "imported",
        import_row_id: String(row.id),
        notes: toText(row.notes) || null,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        created_by: context.userId
      });
      if (hourError) throw hourError;

      await supabase
        .from("volunteer_hour_import_rows")
        .update({
          stage_status: "committed",
          matched_volunteer_profile_id: matchedVolunteerProfileId,
          matched_assignment_id: assignmentId,
          error_message: null
        })
        .eq("organization_id", context.organizationId)
        .eq("id", String(row.id));

      committed += 1;
    } catch (error) {
      errors += 1;
      await supabase
        .from("volunteer_hour_import_rows")
        .update({
          stage_status: "error",
          error_message: error instanceof Error ? error.message : "Unable to commit import row."
        })
        .eq("organization_id", context.organizationId)
        .eq("id", String(row.id));
    }
  }

  const { error: finalizeError } = await supabase
    .from("volunteer_hour_imports")
    .update({
      import_status: "committed",
      rows_committed: committed,
      rows_skipped: skipped,
      rows_error: errors
    })
    .eq("organization_id", context.organizationId)
    .eq("id", input.importId);
  if (finalizeError) throw finalizeError;

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_hours_import_committed",
    targetEntityType: "volunteer_hour_imports",
    targetEntityId: input.importId,
    metadata: {
      rowsCommitted: committed,
      rowsSkipped: skipped,
      rowsError: errors
    }
  });

  return {
    importId: input.importId,
    rowsCommitted: committed,
    rowsSkipped: skipped,
    rowsError: errors
  };
}
