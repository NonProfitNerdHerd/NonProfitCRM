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

function normalizeTagLabel(value: unknown) {
  return toText(value).replace(/\s+/g, " ");
}

function normalizeTagKey(value: unknown) {
  return normalizeTagLabel(value).toLowerCase();
}

function uniqueTagLabels(input: unknown[] | undefined) {
  const deduped = new Map<string, string>();
  for (const value of input ?? []) {
    const label = normalizeTagLabel(value);
    if (!label) continue;
    const key = normalizeTagKey(label);
    if (!deduped.has(key)) deduped.set(key, label);
  }
  return Array.from(deduped.values());
}

function volunteerSchemaErrorMessage(error: unknown) {
  const value = error as { message?: string; details?: string; hint?: string; code?: string };
  return [value?.message, value?.details, value?.hint, value?.code]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function isVolunteerSchemaMissingError(error: unknown) {
  const message = volunteerSchemaErrorMessage(error);
  return (
    message.includes("volunteer_profiles") ||
    message.includes("volunteer_event_series") ||
    message.includes("volunteer_events") ||
    message.includes("volunteer_event_roles") ||
    message.includes("volunteer_role_shifts") ||
    message.includes("volunteer_assignments") ||
    message.includes("volunteer_hours") ||
    message.includes("volunteer_hour_imports") ||
    message.includes("volunteer_concerns") ||
    message.includes("volunteer_incidents") ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

export function buildVolunteerCoordinationEmptyState(schemaWarning?: string | null) {
  return {
    schemaWarning:
      schemaWarning ??
      "Volunteer Coordination schema is not available in this environment yet. Run Supabase migration 202603181200 and retry.",
    canViewSensitive: false,
    summary: {
      totalVolunteers: 0,
      activeVolunteers: 0,
      burnoutCount: 0,
      cautionCount: 0,
      totalEvents: 0,
      openRoles: 0,
      waitlistCount: 0,
      substituteCount: 0,
      noShowCount: 0,
      incidentsCount: 0,
      concernsCount: 0
    },
    volunteers: [],
    events: [],
    eventSeries: [],
    eventRoles: [],
    roleShifts: [],
    assignments: [],
    waitlist: [],
    substitutes: [],
    families: [],
    groups: [],
    complianceItems: [],
    concerns: [],
    incidents: [],
    burnoutFlags: [],
    hourImports: [],
    contacts: [],
    tags: [],
    reports: {
      monthlyHours: [],
      topVolunteers: [],
      underfilledEvents: [],
      noShowAssignments: []
    },
    options: {
      eventOptions: [],
      roleOptions: [],
      shiftOptions: [],
      volunteerOptions: []
    }
  };
}

export async function listVolunteerCoordinationTags() {
  const context = await requireVolunteerCoordinationAccess();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id,name,path,parent_tag_id,module,is_active")
    .eq("organization_id", context.organizationId)
    .eq("module", "contacts")
    .eq("is_active", true)
    .order("path", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function ensureVolunteerRootTag(input: {
  organizationId: string;
  userId: string;
  rootName: string;
}) {
  const supabase = await createClient();
  const rootName = normalizeTagLabel(input.rootName);
  const { data: existing, error: existingError } = await supabase
    .from("tags")
    .select("id,name,path,parent_tag_id")
    .eq("organization_id", input.organizationId)
    .eq("module", "contacts")
    .is("parent_tag_id", null)
    .ilike("name", rootName)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing;

  const { data: created, error: createError } = await supabase
    .from("tags")
    .insert({
      organization_id: input.organizationId,
      module: "contacts",
      name: rootName,
      slug: null,
      parent_tag_id: null,
      is_active: true,
      is_system: false,
      created_by: input.userId,
      updated_by: input.userId
    })
    .select("id,name,path,parent_tag_id")
    .single();
  if (createError) throw createError;
  return created;
}

export async function ensureVolunteerTaxonomyTags(input: {
  rootName: string;
  values: string[];
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const labels = uniqueTagLabels(input.values);
  if (labels.length === 0) return [] as Array<Record<string, unknown>>;

  const root = await ensureVolunteerRootTag({
    organizationId: context.organizationId,
    userId: context.userId,
    rootName: input.rootName
  });

  const { data: existingChildren, error: childrenError } = await supabase
    .from("tags")
    .select("id,name,path,parent_tag_id")
    .eq("organization_id", context.organizationId)
    .eq("module", "contacts")
    .eq("parent_tag_id", root.id);
  if (childrenError) throw childrenError;

  const byName = new Map<string, Record<string, unknown>>();
  for (const child of existingChildren ?? []) {
    byName.set(normalizeTagKey(child.name), child);
  }

  for (const value of labels) {
    const key = normalizeTagKey(value);
    if (byName.has(key)) continue;
    const { data: created, error: createError } = await supabase
      .from("tags")
      .insert({
        organization_id: context.organizationId,
        module: "contacts",
        name: value,
        slug: null,
        parent_tag_id: root.id,
        is_active: true,
        is_system: false,
        created_by: context.userId,
        updated_by: context.userId
      })
      .select("id,name,path,parent_tag_id")
      .single();
    if (createError && createError.code !== "23505") throw createError;
    if (created) byName.set(key, created);
  }

  const results: Array<Record<string, unknown>> = [];
  for (const value of labels) {
    const matched = byName.get(normalizeTagKey(value));
    if (matched) {
      results.push(matched);
      continue;
    }
    const { data: fetched, error: fetchError } = await supabase
      .from("tags")
      .select("id,name,path,parent_tag_id")
      .eq("organization_id", context.organizationId)
      .eq("module", "contacts")
      .eq("parent_tag_id", root.id)
      .ilike("name", value)
      .limit(1)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (fetched) {
      byName.set(normalizeTagKey(fetched.name), fetched);
      results.push(fetched);
    }
  }
  return results;
}

async function resolveVolunteerTaxonomyNames(input: {
  organizationId: string;
  userId: string;
  rootName: string;
  values?: string[];
}) {
  const labels = uniqueTagLabels(input.values);
  if (labels.length === 0) return [] as string[];
  const root = await ensureVolunteerRootTag({
    organizationId: input.organizationId,
    userId: input.userId,
    rootName: input.rootName
  });
  const supabase = await createClient();
  const { data: existingChildren, error: childrenError } = await supabase
    .from("tags")
    .select("id,name")
    .eq("organization_id", input.organizationId)
    .eq("module", "contacts")
    .eq("parent_tag_id", root.id);
  if (childrenError) throw childrenError;

  const byName = new Map<string, string>();
  for (const child of existingChildren ?? []) {
    byName.set(normalizeTagKey(child.name), normalizeTagLabel(child.name));
  }

  for (const value of labels) {
    const key = normalizeTagKey(value);
    if (byName.has(key)) continue;
    const { data: created, error: createError } = await supabase
      .from("tags")
      .insert({
        organization_id: input.organizationId,
        module: "contacts",
        name: value,
        slug: null,
        parent_tag_id: root.id,
        is_active: true,
        is_system: false,
        created_by: input.userId,
        updated_by: input.userId
      })
      .select("name")
      .single();
    if (createError && createError.code !== "23505") throw createError;
    if (created) {
      byName.set(key, normalizeTagLabel(created.name));
      continue;
    }
    const { data: fetched, error: fetchError } = await supabase
      .from("tags")
      .select("name")
      .eq("organization_id", input.organizationId)
      .eq("module", "contacts")
      .eq("parent_tag_id", root.id)
      .ilike("name", value)
      .limit(1)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (fetched) byName.set(key, normalizeTagLabel(fetched.name));
  }

  return labels.map((value) => byName.get(normalizeTagKey(value)) ?? value);
}

export async function getVolunteerProfileForContact(contactId: string) {
  const context = await requireVolunteerCoordinationAccess();
  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("volunteer_profiles")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("contact_id", contactId)
    .maybeSingle();
  if (profileError) throw profileError;
  return {
    profile: profile ?? null
  };
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

  const { data: roleShifts, error: roleShiftsError } = await supabase
    .from("volunteer_role_shifts")
    .select("*")
    .eq("organization_id", context.organizationId)
    .in("event_id", eventIds.length > 0 ? eventIds : ["00000000-0000-0000-0000-000000000000"])
    .order("shift_start", { ascending: true });
  if (roleShiftsError) throw roleShiftsError;

  const { data: eventSeries, error: eventSeriesError } = await supabase
    .from("volunteer_event_series")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (eventSeriesError) throw eventSeriesError;

  let assignmentQuery = supabase
    .from("volunteer_assignments")
    .select(
      "*, volunteer_profiles(contact_id), volunteer_events(event_name,event_date), volunteer_event_roles(role_name), volunteer_role_shifts(shift_name,shift_start,shift_end,number_needed)"
    )
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
    .select(
      "*, volunteer_event_roles(role_name), volunteer_events(event_name,event_date), volunteer_role_shifts(shift_name,shift_start,shift_end,number_needed)"
    )
    .eq("organization_id", context.organizationId)
    .order("waitlist_order", { ascending: true })
    .limit(500);
  if (waitlistError) throw waitlistError;

  const { data: substitutes, error: substitutesError } = await supabase
    .from("volunteer_substitute_entries")
    .select(
      "*, volunteer_event_roles(role_name), volunteer_events(event_name,event_date), volunteer_role_shifts(shift_name,shift_start,shift_end,number_needed)"
    )
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
    roleShifts: roleShifts ?? [],
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
      shiftOptions: (roleShifts ?? []).map((shift) => ({
        id: String(shift.id),
        eventId: String(shift.event_id),
        roleId: String(shift.role_id),
        label:
          toText(shift.shift_name) ||
          `${toText(shift.shift_start)} - ${toText(shift.shift_end)} (${toText(shift.number_needed) || "0"} needed)`
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

export async function getVolunteerProfileDetail(profileId: string) {
  const context = await requireVolunteerCoordinationAccess();
  const canViewSensitive = await hasAnyStaffPermission(
    ["can_view_volunteer_sensitive", "can_manage_volunteer_sensitive"],
    context
  );
  const supabase = await createClient();

  const { data: profile, error: profileError } = await supabase
    .from("volunteer_profiles")
    .select("*, contacts(*)")
    .eq("organization_id", context.organizationId)
    .eq("id", profileId)
    .single();
  if (profileError) throw profileError;

  const { data: guardians, error: guardianError } = await supabase
    .from("volunteer_profile_guardians")
    .select("*, contacts(*)")
    .eq("organization_id", context.organizationId)
    .eq("volunteer_profile_id", profileId)
    .order("created_at", { ascending: false });
  if (guardianError) throw guardianError;

  const { data: assignments, error: assignmentsError } = await supabase
    .from("volunteer_assignments")
    .select("*, volunteer_events(*), volunteer_event_roles(*)")
    .eq("organization_id", context.organizationId)
    .eq("volunteer_profile_id", profileId)
    .order("assigned_at", { ascending: false })
    .limit(300);
  if (assignmentsError) throw assignmentsError;

  const { data: hours, error: hoursError } = await supabase
    .from("volunteer_hours")
    .select("*, volunteer_events(*), volunteer_event_roles(*)")
    .eq("organization_id", context.organizationId)
    .eq("volunteer_profile_id", profileId)
    .order("service_date", { ascending: false })
    .limit(300);
  if (hoursError) throw hoursError;

  const { data: waitlist, error: waitlistError } = await supabase
    .from("volunteer_waitlist_entries")
    .select("*, volunteer_events(*), volunteer_event_roles(*)")
    .eq("organization_id", context.organizationId)
    .eq("volunteer_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (waitlistError) throw waitlistError;

  const { data: substitutes, error: substitutesError } = await supabase
    .from("volunteer_substitute_entries")
    .select("*, volunteer_events(*), volunteer_event_roles(*)")
    .eq("organization_id", context.organizationId)
    .eq("volunteer_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (substitutesError) throw substitutesError;

  const sensitivePayload = canViewSensitive
    ? await Promise.all([
        supabase
          .from("volunteer_compliance_items")
          .select("*")
          .eq("organization_id", context.organizationId)
          .eq("volunteer_profile_id", profileId)
          .order("updated_at", { ascending: false }),
        supabase
          .from("volunteer_concerns")
          .select("*")
          .eq("organization_id", context.organizationId)
          .eq("volunteer_profile_id", profileId)
          .order("concern_date", { ascending: false }),
        supabase
          .from("volunteer_burnout_flags")
          .select("*")
          .eq("organization_id", context.organizationId)
          .eq("volunteer_profile_id", profileId)
          .order("created_at", { ascending: false }),
        supabase
          .from("volunteer_incident_people")
          .select("incident_id,volunteer_incidents(*)")
          .eq("organization_id", context.organizationId)
          .eq("volunteer_profile_id", profileId)
          .order("created_at", { ascending: false })
      ])
    : [];

  return {
    canViewSensitive,
    profile,
    guardians: guardians ?? [],
    assignments: assignments ?? [],
    hours: hours ?? [],
    waitlist: waitlist ?? [],
    substitutes: substitutes ?? [],
    complianceItems: canViewSensitive ? (sensitivePayload[0] as { data: unknown[] | null }).data ?? [] : [],
    concerns: canViewSensitive ? (sensitivePayload[1] as { data: unknown[] | null }).data ?? [] : [],
    burnoutFlags: canViewSensitive ? (sensitivePayload[2] as { data: unknown[] | null }).data ?? [] : [],
    incidents:
      canViewSensitive
        ? ((sensitivePayload[3] as { data: Array<Record<string, unknown>> | null }).data ?? []).map(
            (row) =>
              (Array.isArray(row.volunteer_incidents)
                ? row.volunteer_incidents[0]
                : row.volunteer_incidents) as Record<string, unknown>
          )
        : []
  };
}

export async function getVolunteerEventDetail(eventId: string) {
  const context = await requireVolunteerCoordinationAccess();
  const canViewSensitive = await hasAnyStaffPermission(
    ["can_view_volunteer_sensitive", "can_manage_volunteer_sensitive"],
    context
  );
  const supabase = await createClient();

  const { data: event, error: eventError } = await supabase
    .from("volunteer_events")
    .select("*, volunteer_event_series(*)")
    .eq("organization_id", context.organizationId)
    .eq("id", eventId)
    .single();
  if (eventError) throw eventError;

  const { data: roles, error: rolesError } = await supabase
    .from("volunteer_event_roles")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  if (rolesError) throw rolesError;

  const { data: roleShifts, error: roleShiftsError } = await supabase
    .from("volunteer_role_shifts")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("event_id", eventId)
    .order("shift_start", { ascending: true });
  if (roleShiftsError) throw roleShiftsError;

  const { data: assignments, error: assignmentsError } = await supabase
    .from("volunteer_assignments")
    .select("*, volunteer_profiles(*,contacts(*)), volunteer_event_roles(*), volunteer_role_shifts(*)")
    .eq("organization_id", context.organizationId)
    .eq("event_id", eventId)
    .order("assigned_at", { ascending: false })
    .limit(600);
  if (assignmentsError) throw assignmentsError;

  const { data: waitlist, error: waitlistError } = await supabase
    .from("volunteer_waitlist_entries")
    .select("*, volunteer_profiles(*,contacts(*)), volunteer_event_roles(*), volunteer_role_shifts(*)")
    .eq("organization_id", context.organizationId)
    .eq("event_id", eventId)
    .order("waitlist_order", { ascending: true })
    .limit(600);
  if (waitlistError) throw waitlistError;

  const { data: substitutes, error: substitutesError } = await supabase
    .from("volunteer_substitute_entries")
    .select("*, volunteer_profiles(*,contacts(*)), volunteer_event_roles(*), volunteer_role_shifts(*)")
    .eq("organization_id", context.organizationId)
    .eq("event_id", eventId)
    .order("priority_order", { ascending: true })
    .limit(600);
  if (substitutesError) throw substitutesError;

  const { data: hours, error: hoursError } = await supabase
    .from("volunteer_hours")
    .select("*, volunteer_profiles(*,contacts(*)), volunteer_event_roles(*), volunteer_role_shifts(*)")
    .eq("organization_id", context.organizationId)
    .eq("event_id", eventId)
    .order("service_date", { ascending: false })
    .limit(600);
  if (hoursError) throw hoursError;

  const { data: imports, error: importsError } = await supabase
    .from("volunteer_hour_imports")
    .select("*, volunteer_hour_import_rows(*)")
    .eq("organization_id", context.organizationId)
    .eq("event_id", eventId)
    .order("imported_at", { ascending: false })
    .limit(100);
  if (importsError) throw importsError;

  const incidents = canViewSensitive
    ? await supabase
        .from("volunteer_incidents")
        .select("*, volunteer_event_roles(*)")
        .eq("organization_id", context.organizationId)
        .eq("event_id", eventId)
        .order("incident_at", { ascending: false })
    : { data: [] as unknown[], error: null };
  if (incidents.error) throw incidents.error;

  const hoursByRole = new Map<string, number>();
  for (const row of hours ?? []) {
    const roleId = toText(row.role_id) || "unassigned";
    const actualHours = toNumber(row.actual_hours);
    hoursByRole.set(roleId, (hoursByRole.get(roleId) ?? 0) + actualHours);
  }

  return {
    canViewSensitive,
    event,
    roles: roles ?? [],
    roleShifts: roleShifts ?? [],
    assignments: assignments ?? [],
    waitlist: waitlist ?? [],
    substitutes: substitutes ?? [],
    hours: hours ?? [],
    imports: imports ?? [],
    incidents: incidents.data ?? [],
    reporting: {
      roleHours: Array.from(hoursByRole.entries()).map(([roleId, hoursTotal]) => ({
        roleId,
        hoursTotal: Math.round(hoursTotal * 100) / 100
      }))
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
  const [interestNames, skillNames, certificationNames] = await Promise.all([
    resolveVolunteerTaxonomyNames({
      organizationId: context.organizationId,
      userId: context.userId,
      rootName: "Interests",
      values: input.interests
    }),
    resolveVolunteerTaxonomyNames({
      organizationId: context.organizationId,
      userId: context.userId,
      rootName: "Skills",
      values: input.skills
    }),
    resolveVolunteerTaxonomyNames({
      organizationId: context.organizationId,
      userId: context.userId,
      rootName: "Certifications",
      values: input.certifications
    })
  ]);

  const payload = {
    organization_id: context.organizationId,
    contact_id: input.contactId,
    volunteer_status: toText(input.volunteerStatus) || "prospective",
    volunteer_type: toText(input.volunteerType) || "individual",
    availability_preferences: input.availabilityPreferences ?? {},
    interests: interestNames,
    skills: skillNames,
    certifications: certificationNames,
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

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function isRecurrenceMatch(input: {
  date: Date;
  startsOn: Date;
  recurrencePattern: string;
  recurrenceInterval: number;
  recurrenceDaysOfWeek: number[];
  recurrenceDayOfMonth: number | null;
}) {
  const diffDays = Math.floor((input.date.getTime() - input.startsOn.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return false;

  if (input.recurrencePattern === "daily") {
    return diffDays % Math.max(1, input.recurrenceInterval) === 0;
  }

  if (input.recurrencePattern === "monthly") {
    const startsYear = input.startsOn.getUTCFullYear();
    const startsMonth = input.startsOn.getUTCMonth();
    const year = input.date.getUTCFullYear();
    const month = input.date.getUTCMonth();
    const monthDiff = (year - startsYear) * 12 + (month - startsMonth);
    if (monthDiff < 0 || monthDiff % Math.max(1, input.recurrenceInterval) !== 0) return false;
    const targetDay = input.recurrenceDayOfMonth ?? input.startsOn.getUTCDate();
    return input.date.getUTCDate() === targetDay;
  }

  const intervalWeeks =
    input.recurrencePattern === "biweekly"
      ? Math.max(1, input.recurrenceInterval) * 2
      : Math.max(1, input.recurrenceInterval);
  const weekIndex = Math.floor(diffDays / 7);
  if (weekIndex % intervalWeeks !== 0) return false;
  const weekday = input.date.getUTCDay();
  const days = input.recurrenceDaysOfWeek.length > 0
    ? input.recurrenceDaysOfWeek
    : [input.startsOn.getUTCDay()];
  return days.includes(weekday);
}

export async function generateVolunteerEventInstances(input: {
  seriesId: string;
  throughDate?: string | null;
  maxOccurrences?: number | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const { data: series, error: seriesError } = await supabase
    .from("volunteer_event_series")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", input.seriesId)
    .single();
  if (seriesError) throw seriesError;
  if (!series || !Boolean(series.is_active)) {
    throw new Error("Recurring series is not active.");
  }

  const { data: existingEvents, error: eventsError } = await supabase
    .from("volunteer_events")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("series_id", input.seriesId)
    .order("event_date", { ascending: true });
  if (eventsError) throw eventsError;
  if (!existingEvents || existingEvents.length === 0) {
    throw new Error("Series requires at least one seed event before generating future instances.");
  }

  const templateEvent = existingEvents.find((event) => !Boolean(event.is_series_override)) ?? existingEvents[0];
  const { data: templateRoles, error: templateRolesError } = await supabase
    .from("volunteer_event_roles")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("event_id", String(templateEvent.id))
    .order("created_at", { ascending: true });
  if (templateRolesError) throw templateRolesError;

  const { data: templateRoleShifts, error: templateRoleShiftsError } = await supabase
    .from("volunteer_role_shifts")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("event_id", String(templateEvent.id))
    .order("shift_start", { ascending: true });
  if (templateRoleShiftsError) throw templateRoleShiftsError;

  const existingDateSet = new Set(existingEvents.map((event) => String(event.event_date)));
  const startsOnText = toText(series.starts_on) || toText(templateEvent.event_date);
  const startsOn = new Date(`${startsOnText}T00:00:00.000Z`);
  if (Number.isNaN(startsOn.getTime())) throw new Error("Series start date is invalid.");

  const today = new Date();
  const defaultThrough = addMonths(today, 6);
  const inputThrough = parseDate(input.throughDate);
  const seriesEndsOn = parseDate(series.ends_on);
  const throughDate = new Date(
    `${inputThrough || seriesEndsOn || dateOnly(defaultThrough)}T00:00:00.000Z`
  );
  const maxOccurrences = Math.max(
    1,
    input.maxOccurrences !== null && input.maxOccurrences !== undefined
      ? toNumber(input.maxOccurrences, 24)
      : toNumber(series.ends_after_occurrences, 24)
  );

  const recurrencePattern = toText(series.recurrence_pattern) || "weekly";
  const recurrenceInterval = Math.max(1, toNumber(series.recurrence_interval, 1));
  const recurrenceDays = Array.isArray(series.recurrence_days_of_week)
    ? series.recurrence_days_of_week
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value >= 0 && value <= 6)
    : [];
  const recurrenceDayOfMonth =
    series.recurrence_day_of_month === null || series.recurrence_day_of_month === undefined
      ? null
      : toNumber(series.recurrence_day_of_month);

  const candidateDates: string[] = [];
  let cursor = new Date(startsOn);
  const safetyLimit = 4000;
  let safetyCounter = 0;
  while (cursor <= throughDate && candidateDates.length < maxOccurrences && safetyCounter < safetyLimit) {
    safetyCounter += 1;
    if (
      isRecurrenceMatch({
        date: cursor,
        startsOn,
        recurrencePattern,
        recurrenceInterval,
        recurrenceDaysOfWeek: recurrenceDays,
        recurrenceDayOfMonth
      })
    ) {
      const isoDate = dateOnly(cursor);
      if (!existingDateSet.has(isoDate)) {
        candidateDates.push(isoDate);
      }
    }
    cursor = addDays(cursor, 1);
  }

  if (candidateDates.length === 0) {
    return {
      seriesId: input.seriesId,
      createdEvents: 0,
      createdRoles: 0
    };
  }

  let createdEvents = 0;
  let createdRoles = 0;

  for (const eventDate of candidateDates) {
    const { data: createdEvent, error: createEventError } = await supabase
      .from("volunteer_events")
      .insert({
        organization_id: context.organizationId,
        series_id: input.seriesId,
        event_name: templateEvent.event_name,
        event_type: templateEvent.event_type,
        program_department: templateEvent.program_department,
        event_status: "recruiting",
        event_description: templateEvent.event_description,
        event_date: eventDate,
        start_time: templateEvent.start_time,
        end_time: templateEvent.end_time,
        location: templateEvent.location,
        coordinator_user_id: templateEvent.coordinator_user_id,
        visibility: templateEvent.visibility,
        capacity_total: templateEvent.capacity_total,
        capacity_filled: 0,
        notes: templateEvent.notes,
        attachment_urls: templateEvent.attachment_urls ?? [],
        meal_options: templateEvent.meal_options ?? [],
        tshirt_options: templateEvent.tshirt_options ?? [],
        family_friendly: templateEvent.family_friendly,
        group_allowed: templateEvent.group_allowed,
        minor_allowed: templateEvent.minor_allowed,
        is_series_override: false,
        created_by: context.userId,
        updated_by: context.userId
      })
      .select("*")
      .single();
    if (createEventError) throw createEventError;
    createdEvents += 1;

    const oldToNewRoleId = new Map<string, string>();
    for (const role of templateRoles ?? []) {
      const { data: createdRole, error: createRoleError } = await supabase
        .from("volunteer_event_roles")
        .insert({
          organization_id: context.organizationId,
          event_id: String(createdEvent.id),
          parent_role_id: null,
          role_name: role.role_name,
          role_description: role.role_description,
          shift_start: role.shift_start,
          shift_end: role.shift_end,
          number_needed: role.number_needed,
          number_filled: 0,
          waitlist_enabled: role.waitlist_enabled,
          substitute_enabled: role.substitute_enabled,
          is_lead_role: role.is_lead_role,
          required_skills: role.required_skills ?? [],
          required_tags: role.required_tags ?? [],
          required_certifications: role.required_certifications ?? [],
          required_training: role.required_training ?? [],
          background_check_required: role.background_check_required,
          driver_eligibility_required: role.driver_eligibility_required,
          minor_allowed: role.minor_allowed,
          family_member_allowed: role.family_member_allowed,
          group_participant_allowed: role.group_participant_allowed,
          physical_requirements: role.physical_requirements,
          meal_eligible: role.meal_eligible,
          tshirt_eligible: role.tshirt_eligible,
          check_in_location: role.check_in_location,
          supervisor_contact_id: role.supervisor_contact_id,
          notes: role.notes,
          created_by: context.userId,
          updated_by: context.userId
        })
        .select("id")
        .single();
      if (createRoleError) throw createRoleError;
      oldToNewRoleId.set(String(role.id), String(createdRole.id));
      createdRoles += 1;
    }

    for (const role of templateRoles ?? []) {
      if (!role.parent_role_id) continue;
      const newRoleId = oldToNewRoleId.get(String(role.id));
      const newParentRoleId = oldToNewRoleId.get(String(role.parent_role_id));
      if (!newRoleId || !newParentRoleId) continue;
      const { error: patchParentError } = await supabase
        .from("volunteer_event_roles")
        .update({ parent_role_id: newParentRoleId })
        .eq("organization_id", context.organizationId)
        .eq("id", newRoleId);
      if (patchParentError) throw patchParentError;
    }

    for (const shift of templateRoleShifts ?? []) {
      const newRoleId = oldToNewRoleId.get(String(shift.role_id));
      if (!newRoleId) continue;
      const { error: createShiftError } = await supabase.from("volunteer_role_shifts").insert({
        organization_id: context.organizationId,
        event_id: String(createdEvent.id),
        role_id: newRoleId,
        shift_name: shift.shift_name,
        shift_start: shift.shift_start,
        shift_end: shift.shift_end,
        number_needed: shift.number_needed,
        number_filled: 0,
        supervisor_contact_id: shift.supervisor_contact_id,
        check_in_location: shift.check_in_location,
        notes: shift.notes,
        waitlist_enabled: shift.waitlist_enabled,
        substitute_enabled: shift.substitute_enabled,
        max_waitlist_count: shift.max_waitlist_count,
        max_substitute_count: shift.max_substitute_count,
        substitute_scope: shift.substitute_scope,
        created_by: context.userId,
        updated_by: context.userId
      });
      if (createShiftError) throw createShiftError;
    }
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_event_series_instances_generated",
    targetEntityType: "volunteer_event_series",
    targetEntityId: input.seriesId,
    metadata: {
      createdEvents,
      createdRoles,
      throughDate: dateOnly(throughDate),
      maxOccurrences
    }
  });

  return {
    seriesId: input.seriesId,
    createdEvents,
    createdRoles
  };
}

export async function runVolunteerSeriesGenerationJob(input?: {
  throughDate?: string | null;
  maxOccurrencesPerSeries?: number | null;
  limitSeries?: number | null;
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();
  const limitSeries = Math.max(1, toNumber(input?.limitSeries ?? 20, 20));
  const today = new Date().toISOString().slice(0, 10);

  const { data: activeSeries, error } = await supabase
    .from("volunteer_event_series")
    .select("id,series_name,starts_on,ends_on,is_active")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true)
    .lte("starts_on", today)
    .order("starts_on", { ascending: true })
    .limit(limitSeries);
  if (error) throw error;

  const results: Array<Record<string, unknown>> = [];
  for (const series of activeSeries ?? []) {
    try {
      const generated = await generateVolunteerEventInstances({
        seriesId: String(series.id),
        throughDate: input?.throughDate ?? null,
        maxOccurrences: input?.maxOccurrencesPerSeries ?? null
      });
      results.push({
        seriesId: String(series.id),
        seriesName: toText(series.series_name),
        createdEvents: generated.createdEvents,
        createdRoles: generated.createdRoles
      });
    } catch (jobError) {
      const value = jobError as { message?: string };
      results.push({
        seriesId: String(series.id),
        seriesName: toText(series.series_name),
        error: value?.message ?? "Generation failed."
      });
    }
  }

  await logAuditEvent({
    organizationId: context.organizationId,
    actorUserId: context.userId,
    actionType: "volunteer_event_series_job_run",
    targetEntityType: "volunteer_event_series",
    metadata: {
      limitSeries,
      throughDate: input?.throughDate ?? null,
      maxOccurrencesPerSeries: input?.maxOccurrencesPerSeries ?? null,
      results
    }
  });

  return {
    processedSeries: results.length,
    results
  };
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

export async function upsertVolunteerRoleShift(input: {
  id?: string;
  eventId: string;
  roleId: string;
  shiftName?: string | null;
  shiftStart: string;
  shiftEnd: string;
  numberNeeded?: number;
  supervisorContactId?: string | null;
  checkInLocation?: string | null;
  notes?: string | null;
  waitlistEnabled?: boolean;
  substituteEnabled?: boolean;
  maxWaitlistCount?: number | null;
  maxSubstituteCount?: number | null;
  substituteScope?: "shift" | "role";
}) {
  const context = await requireVolunteerCoordinationManager();
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    event_id: input.eventId,
    role_id: input.roleId,
    shift_name: toText(input.shiftName) || null,
    shift_start: toText(input.shiftStart),
    shift_end: toText(input.shiftEnd),
    number_needed: Math.max(1, toNumber(input.numberNeeded, 1)),
    supervisor_contact_id: toText(input.supervisorContactId) || null,
    check_in_location: toText(input.checkInLocation) || null,
    notes: toText(input.notes) || null,
    waitlist_enabled: input.waitlistEnabled !== false,
    substitute_enabled: input.substituteEnabled !== false,
    max_waitlist_count:
      input.maxWaitlistCount === null || input.maxWaitlistCount === undefined
        ? null
        : Math.max(0, toNumber(input.maxWaitlistCount, 0)),
    max_substitute_count:
      input.maxSubstituteCount === null || input.maxSubstituteCount === undefined
        ? null
        : Math.max(0, toNumber(input.maxSubstituteCount, 0)),
    substitute_scope: input.substituteScope === "role" ? "role" : "shift",
    updated_by: context.userId
  };

  let data: Record<string, unknown> | null = null;
  if (toText(input.id)) {
    const response = await supabase
      .from("volunteer_role_shifts")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    data = response.data as Record<string, unknown>;
  } else {
    const response = await supabase
      .from("volunteer_role_shifts")
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
    actionType: "volunteer_role_shift_upserted",
    targetEntityType: "volunteer_role_shifts",
    targetEntityId: toText(data?.id),
    metadata: {
      eventId: input.eventId,
      roleId: input.roleId,
      shiftStart: payload.shift_start,
      shiftEnd: payload.shift_end
    }
  });

  return data;
}

export async function upsertVolunteerAssignment(input: {
  id?: string;
  volunteerProfileId: string;
  eventId: string;
  roleId?: string | null;
  shiftId?: string | null;
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
    shift_id: toText(input.shiftId) || null,
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
      shiftId: payload.shift_id,
      status: payload.assignment_status
    }
  });

  return data;
}

export async function upsertWaitlistEntry(input: {
  id?: string;
  eventId: string;
  roleId: string;
  shiftId?: string | null;
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
    shift_id: toText(input.shiftId) || null,
    volunteer_profile_id: input.volunteerProfileId,
    waitlist_order: Math.max(1, toNumber(input.waitlistOrder, 1)),
    entry_status: toText(input.entryStatus) || "waiting",
    notes: toText(input.notes) || null
  };

  if (toText(input.id)) {
    const response = await supabase
      .from("volunteer_waitlist_entries")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    return response.data as Record<string, unknown>;
  }

  let existingQuery = supabase
    .from("volunteer_waitlist_entries")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("event_id", input.eventId)
    .eq("role_id", input.roleId)
    .eq("volunteer_profile_id", input.volunteerProfileId);
  existingQuery = payload.shift_id
    ? existingQuery.eq("shift_id", payload.shift_id)
    : existingQuery.is("shift_id", null);
  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw existingError;

  if (existing?.id) {
    const response = await supabase
      .from("volunteer_waitlist_entries")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", String(existing.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    return response.data as Record<string, unknown>;
  }

  const response = await supabase
    .from("volunteer_waitlist_entries")
    .insert({
      ...payload,
      created_by: context.userId
    })
    .select("*")
    .single();
  if (response.error) throw response.error;
  return response.data as Record<string, unknown>;
}

export async function upsertSubstituteEntry(input: {
  id?: string;
  eventId: string;
  roleId?: string | null;
  shiftId?: string | null;
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
    shift_id: toText(input.shiftId) || null,
    volunteer_profile_id: input.volunteerProfileId,
    availability_status: toText(input.availabilityStatus) || "available",
    priority_order: Math.max(1, toNumber(input.priorityOrder, 1)),
    notes: toText(input.notes) || null
  };

  if (toText(input.id)) {
    const response = await supabase
      .from("volunteer_substitute_entries")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    return response.data as Record<string, unknown>;
  }

  let existingQuery = supabase
    .from("volunteer_substitute_entries")
    .select("id")
    .eq("organization_id", context.organizationId)
    .eq("event_id", input.eventId)
    .eq("volunteer_profile_id", input.volunteerProfileId);
  existingQuery = payload.shift_id
    ? existingQuery.eq("shift_id", payload.shift_id)
    : existingQuery.is("shift_id", null);
  existingQuery = payload.role_id
    ? existingQuery.eq("role_id", payload.role_id)
    : existingQuery.is("role_id", null);

  const { data: existing, error: existingError } = await existingQuery.maybeSingle();
  if (existingError) throw existingError;
  if (existing?.id) {
    const response = await supabase
      .from("volunteer_substitute_entries")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", String(existing.id))
      .select("*")
      .single();
    if (response.error) throw response.error;
    return response.data as Record<string, unknown>;
  }

  const response = await supabase
    .from("volunteer_substitute_entries")
    .insert({
      ...payload,
      created_by: context.userId
    })
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
