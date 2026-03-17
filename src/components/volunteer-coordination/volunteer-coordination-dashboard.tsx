"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TagTypeaheadMulti,
  type TagTypeaheadOption
} from "@/components/tags/tag-typeahead-multi";

type DashboardTab =
  | "overview"
  | "volunteers"
  | "events"
  | "assignments"
  | "families-groups"
  | "hours"
  | "safety"
  | "reports";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function parseCsv(text: string) {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message);
  }
  return parsed.data;
}

function parseWorkbook(buffer: ArrayBuffer, sheetName?: string) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const selectedSheet = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
  return { rows, sheetNames: workbook.SheetNames, selectedSheet };
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function splitList(value: unknown) {
  const text = toText(value);
  if (!text) return [] as string[];
  return Array.from(
    new Set(
      text
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function guessHourImportColumn(headers: string[], keys: string[]) {
  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (keys.includes(normalized)) return header;
  }
  return "";
}

function resolveVolunteerTaxonomyOptions(
  tags: Array<{ id: string; name: string; label?: string; parentTagId?: string }>,
  rootName: string
) {
  const root = tags.find(
    (tag) => !tag.parentTagId && normalizeKey(tag.name) === normalizeKey(rootName)
  );
  if (!root) return [] as TagTypeaheadOption[];
  const rootLabelPrefix = `${rootName.toLowerCase()} /`;
  return tags
    .filter((tag) => {
      if (!tag.parentTagId || tag.id === root.id) return false;
      const normalizedLabel = toText(tag.label).toLowerCase();
      return tag.parentTagId === root.id || normalizedLabel.startsWith(rootLabelPrefix);
    })
    .map((tag) => ({
      id: tag.id,
      name: normalizeLabel(tag.name),
      label: tag.label
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function normalizeLabel(value: unknown) {
  return toText(value).replace(/\s+/g, " ");
}

function normalizeKey(value: unknown) {
  return normalizeLabel(value).toLowerCase();
}

export function VolunteerCoordinationDashboard({
  initialTab = "overview",
  hideInternalTabs = false
}: {
  initialTab?: DashboardTab;
  hideInternalTabs?: boolean;
}) {
  const [tab, setTab] = useState<DashboardTab>(initialTab);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);

  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [volunteerStatusFilter, setVolunteerStatusFilter] = useState("");
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [burnoutOnlyFilter, setBurnoutOnlyFilter] = useState(false);
  const [cautionOnlyFilter, setCautionOnlyFilter] = useState(false);

  const [volunteerForm, setVolunteerForm] = useState({
    id: "",
    contactId: "",
    volunteerStatus: "prospective",
    volunteerType: "individual",
    availabilityPreferences: "",
    interests: [] as TagTypeaheadOption[],
    skills: [] as TagTypeaheadOption[],
    certifications: [] as TagTypeaheadOption[],
    accommodations: "",
    physicalLimitations: "",
    transportationEligible: false,
    driverEligible: false,
    emergencyContactName: "",
    emergencyContactPhone: "",
    internalNotes: "",
    internalConcerns: "",
    burnoutFlag: false,
    cautionFlag: false,
    softBlacklistFlag: false,
    doNotScheduleUntil: "",
    guardianConsentStatus: "not_required",
    waiverSigned: false,
    minorRequiresGuardianPresent: false,
    backgroundCheckStatus: "pending",
    backgroundCheckExpiresAt: "",
    orientationCompletedAt: "",
    confidentialityAcknowledgedAt: ""
  });

  const [seriesForm, setSeriesForm] = useState({
    seriesName: "",
    recurrencePattern: "weekly",
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: "1",
    recurrenceDayOfMonth: "",
    startsOn: "",
    endsOn: "",
    endsAfterOccurrences: "",
    timezone: "UTC",
    notes: ""
  });
  const [seriesGenerateForm, setSeriesGenerateForm] = useState({
    seriesId: "",
    throughDate: "",
    maxOccurrences: "24"
  });
  const [seriesJobForm, setSeriesJobForm] = useState({
    throughDate: "",
    maxOccurrencesPerSeries: "24",
    limitSeries: "20"
  });

  const [eventForm, setEventForm] = useState({
    id: "",
    eventName: "",
    eventType: "",
    programDepartment: "",
    eventStatus: "draft",
    eventDescription: "",
    eventDate: "",
    startTime: "",
    endTime: "",
    location: "",
    visibility: "internal",
    capacityTotal: 0,
    notes: "",
    mealOptions: "",
    tshirtOptions: "",
    familyFriendly: false,
    groupAllowed: false,
    minorAllowed: false,
    seriesId: ""
  });

  const [roleForm, setRoleForm] = useState({
    id: "",
    eventId: "",
    parentRoleId: "",
    roleName: "",
    roleDescription: "",
    shiftStart: "",
    shiftEnd: "",
    numberNeeded: 1,
    waitlistEnabled: true,
    substituteEnabled: true,
    isLeadRole: false,
    requiredSkills: "",
    requiredTags: [] as TagTypeaheadOption[],
    requiredCertifications: "",
    requiredTraining: "",
    backgroundCheckRequired: false,
    driverEligibilityRequired: false,
    minorAllowed: true,
    familyMemberAllowed: true,
    groupParticipantAllowed: true,
    physicalRequirements: "",
    mealEligible: false,
    tshirtEligible: false,
    checkInLocation: "",
    supervisorContactId: "",
    notes: ""
  });

  const [assignmentForm, setAssignmentForm] = useState({
    id: "",
    volunteerProfileId: "",
    eventId: "",
    roleId: "",
    familyId: "",
    groupId: "",
    assignmentStatus: "invited",
    scheduledHours: "",
    actualHours: "",
    checkInAt: "",
    checkOutAt: "",
    approvalStatus: "pending",
    isLateArrival: false,
    isEarlyDeparture: false,
    lateCancelled: false,
    notes: "",
    noShowReason: ""
  });

  const [waitlistForm, setWaitlistForm] = useState({
    id: "",
    eventId: "",
    roleId: "",
    volunteerProfileId: "",
    waitlistOrder: "1",
    entryStatus: "waiting",
    notes: ""
  });

  const [substituteForm, setSubstituteForm] = useState({
    id: "",
    eventId: "",
    roleId: "",
    volunteerProfileId: "",
    availabilityStatus: "available",
    priorityOrder: "1",
    notes: ""
  });

  const [familyForm, setFamilyForm] = useState({
    id: "",
    familyName: "",
    mustServeTogether: false,
    notes: ""
  });
  const [familyMemberForm, setFamilyMemberForm] = useState({
    familyId: "",
    contactId: "",
    roleInFamily: "",
    isPrimaryContact: false,
    notes: ""
  });

  const [groupForm, setGroupForm] = useState({
    id: "",
    groupName: "",
    groupType: "community",
    groupStatus: "active",
    coordinatorContactId: "",
    estimatedAttendance: "0",
    confirmedAttendance: "0",
    notes: ""
  });
  const [groupMemberForm, setGroupMemberForm] = useState({
    groupId: "",
    contactId: "",
    displayName: "",
    isPlaceholder: false,
    participationStatus: "estimated",
    notes: ""
  });

  const [complianceForm, setComplianceForm] = useState({
    id: "",
    volunteerProfileId: "",
    complianceType: "",
    complianceStatus: "pending",
    completedAt: "",
    expiresAt: "",
    requiredForRoles: "",
    notes: ""
  });
  const [concernForm, setConcernForm] = useState({
    id: "",
    volunteerProfileId: "",
    concernCategory: "attendance",
    concernType: "",
    severity: "medium",
    concernDate: "",
    reviewStatus: "open",
    actionLevel: "caution_only",
    roleRestrictions: "",
    eventRestrictions: "",
    notes: "",
    internalReviewNotes: ""
  });
  const [burnoutForm, setBurnoutForm] = useState({
    id: "",
    volunteerProfileId: "",
    flagType: "manual",
    status: "active",
    pauseDays: "",
    pauseUntil: "",
    reason: ""
  });
  const [incidentForm, setIncidentForm] = useState({
    id: "",
    eventId: "",
    roleId: "",
    assignmentId: "",
    incidentAt: "",
    incidentCategory: "safety_concern",
    severity: "medium",
    description: "",
    witnesses: "",
    actionTaken: "",
    followUpRequired: false,
    followUpNotes: "",
    resolved: false,
    internalOnly: true,
    attachmentUrls: ""
  });

  const [hourImportEventId, setHourImportEventId] = useState("");
  const [hourImportFileName, setHourImportFileName] = useState("");
  const [hourImportRows, setHourImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [hourImportHeaders, setHourImportHeaders] = useState<string[]>([]);
  const [hourImportPreviewRows, setHourImportPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [hourImportSheetNames, setHourImportSheetNames] = useState<string[]>([]);
  const [hourImportSelectedSheet, setHourImportSelectedSheet] = useState("");
  const [hourImportMapping, setHourImportMapping] = useState({
    volunteerNameColumn: "",
    contactIdentifierColumn: "",
    roleColumn: "",
    dateColumn: "",
    checkInColumn: "",
    checkOutColumn: "",
    hoursColumn: "",
    attendanceStatusColumn: "",
    notesColumn: "",
    contactMatchField: "email" as "email" | "phone" | "external_source_id"
  });
  const [stagedImport, setStagedImport] = useState<Record<string, unknown> | null>(null);
  const [stagedRows, setStagedRows] = useState<Array<Record<string, unknown>>>([]);

  const contacts = useMemo(
    () => ((data?.contacts as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const volunteers = useMemo(
    () => ((data?.volunteers as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const events = useMemo(() => ((data?.events as Array<Record<string, unknown>> | undefined) ?? []), [data]);
  const eventSeries = useMemo(
    () => ((data?.eventSeries as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const eventRoles = useMemo(
    () => ((data?.eventRoles as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const assignments = useMemo(
    () => ((data?.assignments as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const waitlist = useMemo(
    () => ((data?.waitlist as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const substitutes = useMemo(
    () => ((data?.substitutes as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const families = useMemo(
    () => ((data?.families as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const groups = useMemo(() => ((data?.groups as Array<Record<string, unknown>> | undefined) ?? []), [data]);
  const complianceItems = useMemo(
    () => ((data?.complianceItems as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const concerns = useMemo(
    () => ((data?.concerns as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const burnoutFlags = useMemo(
    () => ((data?.burnoutFlags as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const incidents = useMemo(
    () => ((data?.incidents as Array<Record<string, unknown>> | undefined) ?? []),
    [data]
  );
  const tags = useMemo(() => ((data?.tags as Array<Record<string, unknown>> | undefined) ?? []), [data]);
  const allTagOptions = useMemo(
    () =>
      tags.map((tag) => ({
        id: toText(tag.id),
        name: normalizeLabel(tag.name),
        label: toText(tag.path) || normalizeLabel(tag.name),
        parentTagId: toText(tag.parent_tag_id)
      })),
    [tags]
  );
  const tagById = useMemo(() => new Map(allTagOptions.map((tag) => [tag.id, tag])), [allTagOptions]);
  const selectedFilterTags = useMemo(
    () => selectedTagIds.map((id) => tagById.get(id)).filter(Boolean) as TagTypeaheadOption[],
    [selectedTagIds, tagById]
  );
  const interestTagOptions = useMemo(
    () => resolveVolunteerTaxonomyOptions(allTagOptions, "Interests"),
    [allTagOptions]
  );
  const skillTagOptions = useMemo(
    () => resolveVolunteerTaxonomyOptions(allTagOptions, "Skills"),
    [allTagOptions]
  );
  const certificationTagOptions = useMemo(
    () => resolveVolunteerTaxonomyOptions(allTagOptions, "Certifications"),
    [allTagOptions]
  );
  const reports = useMemo(() => ((data?.reports as Record<string, unknown> | undefined) ?? {}), [data]);
  const summary = useMemo(() => ((data?.summary as Record<string, unknown> | undefined) ?? {}), [data]);
  const canViewSensitive = Boolean(data?.canViewSensitive);

  const volunteerByContactId = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const volunteer of volunteers) {
      map.set(String(volunteer.contact_id), volunteer);
    }
    return map;
  }, [volunteers]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    setSchemaWarning(null);
    try {
      const params = new URLSearchParams();
      if (volunteerStatusFilter) params.set("volunteerStatus", volunteerStatusFilter);
      if (assignmentStatusFilter) params.set("assignmentStatus", assignmentStatusFilter);
      if (eventTypeFilter) params.set("eventType", eventTypeFilter);
      if (burnoutOnlyFilter) params.set("burnoutOnly", "true");
      if (cautionOnlyFilter) params.set("cautionOnly", "true");
      for (const tagId of selectedTagIds) params.append("tagId", tagId);

      const response = await fetch(`/api/volunteer-coordination/overview?${params.toString()}`);
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error(toText(payload?.message) || "Unable to load Volunteer Coordination data.");
      }
      if (toText(payload?.schemaWarning)) {
        setSchemaWarning(toText(payload?.schemaWarning));
      }
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Volunteer Coordination data.");
    } finally {
      setLoading(false);
    }
  }

  async function runAction(input: {
    endpoint: string;
    method?: "POST" | "PATCH";
    payload: Record<string, unknown>;
    successMessage: string;
  }) {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(input.endpoint, {
        method: input.method ?? "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input.payload)
      });
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error(toText(payload?.message) || "Action failed.");
      }
      setMessage(input.successMessage);
      await loadData();
      return payload?.result ?? null;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function createVolunteerTaxonomyTag(rootName: string, value: string) {
    const response = await fetch("/api/volunteer-coordination/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rootName,
        values: [value]
      })
    });
    const payload = (await response.json().catch(() => null)) as
      | { result?: Array<Record<string, unknown>>; message?: string }
      | null;
    if (!response.ok) {
      throw new Error(toText(payload?.message) || `Unable to create ${rootName} tag.`);
    }
    const created = payload?.result?.[0];
    const id = toText(created?.id);
    const name = normalizeLabel(created?.name || value);
    const label = toText(created?.path) || `${rootName} / ${name}`;
    if (!id) return null;
    await loadData();
    return { id, name, label } satisfies TagTypeaheadOption;
  }

  async function saveVolunteerProfile() {
    await runAction({
      endpoint: "/api/volunteer-coordination/volunteers",
      payload: {
        ...volunteerForm,
        interests: volunteerForm.interests.map((entry) => entry.name),
        skills: volunteerForm.skills.map((entry) => entry.name),
        certifications: volunteerForm.certifications.map((entry) => entry.name),
        availabilityPreferences: volunteerForm.availabilityPreferences
          ? { text: volunteerForm.availabilityPreferences }
          : {}
      },
      successMessage: "Volunteer profile saved."
    });
  }

  async function saveEvent() {
    await runAction({
      endpoint: "/api/volunteer-coordination/events",
      payload: {
        ...eventForm,
        mealOptions: splitList(eventForm.mealOptions),
        tshirtOptions: splitList(eventForm.tshirtOptions)
      },
      successMessage: "Volunteer event saved."
    });
  }

  async function saveSeries() {
    await runAction({
      endpoint: "/api/volunteer-coordination/event-series",
      payload: {
        ...seriesForm,
        recurrenceDaysOfWeek: splitList(seriesForm.recurrenceDaysOfWeek).map((value) => Number(value))
      },
      successMessage: "Recurring series created."
    });
  }

  async function generateSeriesInstances() {
    if (!toText(seriesGenerateForm.seriesId)) {
      setError("Select a series to generate future event instances.");
      return;
    }
    await runAction({
      endpoint: `/api/volunteer-coordination/event-series/${encodeURIComponent(
        seriesGenerateForm.seriesId
      )}/generate`,
      payload: {
        throughDate: seriesGenerateForm.throughDate || null,
        maxOccurrences: seriesGenerateForm.maxOccurrences
          ? Number(seriesGenerateForm.maxOccurrences)
          : null
      },
      successMessage: "Recurring event instances generated."
    });
  }

  async function runRecurringSeriesJob() {
    await runAction({
      endpoint: "/api/volunteer-coordination/recurrence/run",
      payload: {
        throughDate: seriesJobForm.throughDate || null,
        maxOccurrencesPerSeries: seriesJobForm.maxOccurrencesPerSeries
          ? Number(seriesJobForm.maxOccurrencesPerSeries)
          : null,
        limitSeries: seriesJobForm.limitSeries ? Number(seriesJobForm.limitSeries) : null
      },
      successMessage: "Recurring series generation job completed."
    });
  }

  async function saveRole() {
    await runAction({
      endpoint: "/api/volunteer-coordination/roles",
      payload: {
        ...roleForm,
        requiredSkills: splitList(roleForm.requiredSkills),
        requiredTags: roleForm.requiredTags.map((entry) => entry.name),
        requiredCertifications: splitList(roleForm.requiredCertifications),
        requiredTraining: splitList(roleForm.requiredTraining)
      },
      successMessage: "Event role saved."
    });
  }

  async function saveAssignment() {
    await runAction({
      endpoint: "/api/volunteer-coordination/assignments",
      payload: {
        ...assignmentForm,
        scheduledHours: assignmentForm.scheduledHours ? Number(assignmentForm.scheduledHours) : null,
        actualHours: assignmentForm.actualHours ? Number(assignmentForm.actualHours) : null
      },
      successMessage: "Assignment saved."
    });
  }

  async function saveWaitlistEntry() {
    await runAction({
      endpoint: "/api/volunteer-coordination/waitlist",
      payload: {
        ...waitlistForm,
        waitlistOrder: Number(waitlistForm.waitlistOrder || "1")
      },
      successMessage: "Waitlist entry saved."
    });
  }

  async function saveSubstituteEntry() {
    await runAction({
      endpoint: "/api/volunteer-coordination/substitutes",
      payload: {
        ...substituteForm,
        priorityOrder: Number(substituteForm.priorityOrder || "1")
      },
      successMessage: "Substitute entry saved."
    });
  }

  async function saveFamily() {
    await runAction({
      endpoint: "/api/volunteer-coordination/families",
      payload: {
        ...familyForm
      },
      successMessage: "Volunteer family saved."
    });
  }

  async function saveFamilyMember() {
    await runAction({
      endpoint: "/api/volunteer-coordination/family-members",
      payload: {
        ...familyMemberForm
      },
      successMessage: "Family member linked."
    });
  }

  async function saveGroup() {
    await runAction({
      endpoint: "/api/volunteer-coordination/groups",
      payload: {
        ...groupForm,
        estimatedAttendance: Number(groupForm.estimatedAttendance || "0"),
        confirmedAttendance: Number(groupForm.confirmedAttendance || "0")
      },
      successMessage: "Volunteer group saved."
    });
  }

  async function saveGroupMember() {
    await runAction({
      endpoint: "/api/volunteer-coordination/group-members",
      payload: {
        ...groupMemberForm
      },
      successMessage: "Group member saved."
    });
  }

  async function saveComplianceItem() {
    await runAction({
      endpoint: "/api/volunteer-coordination/compliance",
      payload: {
        ...complianceForm,
        requiredForRoles: splitList(complianceForm.requiredForRoles)
      },
      successMessage: "Compliance item saved."
    });
  }

  async function saveConcern() {
    await runAction({
      endpoint: "/api/volunteer-coordination/concerns",
      payload: {
        ...concernForm,
        roleRestrictions: splitList(concernForm.roleRestrictions),
        eventRestrictions: splitList(concernForm.eventRestrictions)
      },
      successMessage: "Concern saved."
    });
  }

  async function saveBurnoutFlag() {
    await runAction({
      endpoint: "/api/volunteer-coordination/burnout-flags",
      payload: {
        ...burnoutForm,
        pauseDays: burnoutForm.pauseDays ? Number(burnoutForm.pauseDays) : null
      },
      successMessage: "Burnout flag saved."
    });
  }

  async function saveIncident() {
    await runAction({
      endpoint: "/api/volunteer-coordination/incidents",
      payload: {
        ...incidentForm,
        attachmentUrls: splitList(incidentForm.attachmentUrls),
        incidentPeople: []
      },
      successMessage: "Incident saved."
    });
  }

  async function handleHoursFileUpload(file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setStagedImport(null);
    setStagedRows([]);
    setHourImportFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv")) {
        const text = await file.text();
        const rows = parseCsv(text);
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        setHourImportRows(rows);
        setHourImportHeaders(headers);
        setHourImportPreviewRows(rows.slice(0, 10));
        setHourImportSheetNames([]);
        setHourImportSelectedSheet("");
        setHourImportMapping({
          volunteerNameColumn: guessHourImportColumn(headers, ["volunteer_name", "name", "full_name"]),
          contactIdentifierColumn: guessHourImportColumn(headers, [
            "email",
            "contact_id",
            "external_source_id",
            "phone"
          ]),
          roleColumn: guessHourImportColumn(headers, ["role", "role_name", "position"]),
          dateColumn: guessHourImportColumn(headers, ["date", "service_date", "event_date"]),
          checkInColumn: guessHourImportColumn(headers, ["check_in", "checkin", "in_time"]),
          checkOutColumn: guessHourImportColumn(headers, ["check_out", "checkout", "out_time"]),
          hoursColumn: guessHourImportColumn(headers, ["hours", "actual_hours", "service_hours"]),
          attendanceStatusColumn: guessHourImportColumn(headers, ["attendance_status", "status"]),
          notesColumn: guessHourImportColumn(headers, ["notes", "note", "memo"]),
          contactMatchField: "email"
        });
      } else {
        const buffer = await file.arrayBuffer();
        const parsed = parseWorkbook(buffer);
        const headers = parsed.rows.length > 0 ? Object.keys(parsed.rows[0]) : [];
        setHourImportRows(parsed.rows);
        setHourImportHeaders(headers);
        setHourImportPreviewRows(parsed.rows.slice(0, 10));
        setHourImportSheetNames(parsed.sheetNames);
        setHourImportSelectedSheet(parsed.selectedSheet);
        setHourImportMapping({
          volunteerNameColumn: guessHourImportColumn(headers, ["volunteer_name", "name", "full_name"]),
          contactIdentifierColumn: guessHourImportColumn(headers, [
            "email",
            "contact_id",
            "external_source_id",
            "phone"
          ]),
          roleColumn: guessHourImportColumn(headers, ["role", "role_name", "position"]),
          dateColumn: guessHourImportColumn(headers, ["date", "service_date", "event_date"]),
          checkInColumn: guessHourImportColumn(headers, ["check_in", "checkin", "in_time"]),
          checkOutColumn: guessHourImportColumn(headers, ["check_out", "checkout", "out_time"]),
          hoursColumn: guessHourImportColumn(headers, ["hours", "actual_hours", "service_hours"]),
          attendanceStatusColumn: guessHourImportColumn(headers, ["attendance_status", "status"]),
          notesColumn: guessHourImportColumn(headers, ["notes", "note", "memo"]),
          contactMatchField: "email"
        });
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to parse hours file.");
    }
  }

  async function reloadHoursWorkbookSheet(file: File, sheetName: string) {
    const buffer = await file.arrayBuffer();
    const parsed = parseWorkbook(buffer, sheetName);
    const headers = parsed.rows.length > 0 ? Object.keys(parsed.rows[0]) : [];
    setHourImportRows(parsed.rows);
    setHourImportHeaders(headers);
    setHourImportPreviewRows(parsed.rows.slice(0, 10));
    setHourImportSelectedSheet(parsed.selectedSheet);
  }

  async function stageHourImport() {
    if (!hourImportEventId) {
      setError("Select an event before staging volunteer hours import.");
      return;
    }
    if (hourImportRows.length === 0) {
      setError("Upload a volunteer hour file before staging import.");
      return;
    }
    const result = await runAction({
      endpoint: "/api/volunteer-coordination/hour-imports/stage",
      payload: {
        eventId: hourImportEventId,
        sourceFilename: hourImportFileName || "uploaded.csv",
        columnMapping: hourImportMapping,
        rows: hourImportRows
      },
      successMessage: "Volunteer hour import staged."
    });
    const typedResult = (result as Record<string, unknown> | null) ?? null;
    setStagedImport((typedResult?.import as Record<string, unknown> | undefined) ?? null);
    setStagedRows((typedResult?.rows as Array<Record<string, unknown>> | undefined) ?? []);
  }

  async function updateStagedRowMatch(rowId: string, contactId: string) {
    const matchedVolunteer = volunteerByContactId.get(contactId);
    const result = await runAction({
      endpoint: `/api/volunteer-coordination/hour-imports/rows/${encodeURIComponent(rowId)}`,
      method: "PATCH",
      payload: {
        matchedContactId: contactId || null,
        matchedVolunteerProfileId: matchedVolunteer ? String(matchedVolunteer.id) : null,
        stageStatus: contactId ? (matchedVolunteer ? "matched" : "unmatched") : "unmatched"
      },
      successMessage: "Staged row updated."
    });
    if (!result) return;
    setStagedRows((prev) =>
      prev.map((row) => (String(row.id) === rowId ? ((result as Record<string, unknown>) ?? row) : row))
    );
  }

  async function commitHourImport() {
    if (!stagedImport?.id) {
      setError("No staged import to commit.");
      return;
    }
    await runAction({
      endpoint: `/api/volunteer-coordination/hour-imports/${encodeURIComponent(
        String(stagedImport.id)
      )}/commit`,
      payload: {},
      successMessage: "Volunteer hour import committed."
    });
    setStagedImport(null);
    setStagedRows([]);
  }

  const loadingIndicator = loading ? <p className="text-xs text-slate-500">Working…</p> : null;

  if (!data) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-700">
            Volunteer Coordination data is not loaded yet. Click to initialize the module view.
          </p>
          <div className="mt-3">
            <Button type="button" onClick={() => void loadData()} disabled={loading}>
              Load Volunteer Coordination
            </Button>
          </div>
          {loadingIndicator}
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!hideInternalTabs ? (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["overview", "Overview"],
                ["volunteers", "Volunteers & Recruiting"],
                ["events", "Events & Roles"],
                ["assignments", "Assignments / Waitlist / Substitutes"],
                ["families-groups", "Families & Groups"],
                ["hours", "Hours Import & Attendance"],
                ["safety", "Compliance / Concerns / Incidents"]
              ] as Array<[DashboardTab, string]>
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                variant={tab === key ? "primary" : "secondary"}
                onClick={() => setTab(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        ) : (
          <div />
        )}
        <Button type="button" variant="secondary" onClick={() => void loadData()} disabled={loading}>
          Refresh
        </Button>
      </div>
      <div className="grid gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Assignment Status Filter</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={assignmentStatusFilter}
            onChange={(event) => setAssignmentStatusFilter(event.target.value)}
          >
            <option value="">All</option>
            <option value="invited">Invited</option>
            <option value="interested">Interested</option>
            <option value="pending_approval">Pending Approval</option>
            <option value="confirmed">Confirmed</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="substitute">Substitute</option>
            <option value="cancelled">Cancelled</option>
            <option value="declined">Declined</option>
            <option value="no_show">No Show</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Event Type Filter</label>
          <Input value={eventTypeFilter} onChange={(event) => setEventTypeFilter(event.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Volunteer Status Filter</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={volunteerStatusFilter}
            onChange={(event) => setVolunteerStatusFilter(event.target.value)}
          >
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="prospective">Prospective</option>
            <option value="do_not_schedule">Do Not Schedule</option>
            <option value="soft_blacklisted">Soft Blacklisted</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="pt-6">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={burnoutOnlyFilter}
              onChange={(event) => setBurnoutOnlyFilter(event.target.checked)}
            />
            Burnout only
          </label>
          <label className="mt-1 flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={cautionOnlyFilter}
              onChange={(event) => setCautionOnlyFilter(event.target.checked)}
            />
            Caution only
          </label>
        </div>
        <div className="pt-6">
          <Button type="button" onClick={() => void loadData()}>
            Apply Global Filters
          </Button>
        </div>
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {schemaWarning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {schemaWarning}
        </p>
      ) : null}
      {loadingIndicator}

      {tab === "overview" ? (
        <section className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total Volunteers" value={toText(summary.totalVolunteers) || "0"} />
            <StatCard label="Active Volunteers" value={toText(summary.activeVolunteers) || "0"} />
            <StatCard label="Open Roles" value={toText(summary.openRoles) || "0"} />
            <StatCard label="No-Shows" value={toText(summary.noShowCount) || "0"} />
            <StatCard label="Burnout Flags" value={toText(summary.burnoutCount) || "0"} />
            <StatCard label="Caution Flags" value={toText(summary.cautionCount) || "0"} />
            <StatCard label="Waitlist Entries" value={toText(summary.waitlistCount) || "0"} />
            <StatCard label="Substitute Entries" value={toText(summary.substituteCount) || "0"} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Upcoming / Underfilled Events</p>
              <TableView
                headers={["Event", "Date", "Status", "Capacity", "Filled"]}
                rows={
                  ((reports.underfilledEvents as Array<Record<string, unknown>> | undefined) ?? []).map((row) => [
                    toText(row.event_name),
                    toText(row.event_date),
                    toText(row.event_status),
                    toText(row.capacity_total) || "0",
                    toText(row.capacity_filled) || "0"
                  ]) as string[][]
                }
              />
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Top Volunteers by Lifetime Hours</p>
              <TableView
                headers={["Volunteer", "Status", "Reliability", "Lifetime Hours", "YTD Hours"]}
                rows={volunteers.slice(0, 15).map((volunteer) => {
                  const contact = (Array.isArray(volunteer.contacts)
                    ? volunteer.contacts[0]
                    : volunteer.contacts) as Record<string, unknown> | null;
                  return [
                    displayContactName(contact),
                    toText(volunteer.volunteer_status),
                    `${toText(volunteer.reliability_indicator)} (${toText(volunteer.reliability_score)})`,
                    toText(volunteer.lifetime_hours),
                    toText(volunteer.ytd_hours)
                  ];
                })}
              />
            </div>
          </div>
        </section>
      ) : null}

      {tab === "volunteers" ? (
        <section className="space-y-3">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-900">Recruiting & Volunteer Filters</p>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Volunteer Status</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={volunteerStatusFilter}
                  onChange={(event) => setVolunteerStatusFilter(event.target.value)}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="prospective">Prospective</option>
                  <option value="do_not_schedule">Do Not Schedule</option>
                  <option value="soft_blacklisted">Soft Blacklisted</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <TagTypeaheadMulti
                label="Tag filter"
                selected={selectedFilterTags}
                options={allTagOptions}
                onChange={(next) => setSelectedTagIds(next.map((entry) => entry.id))}
                placeholder="Type to filter by tags..."
              />
              <div className="space-y-2 pt-6">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={burnoutOnlyFilter}
                    onChange={(event) => setBurnoutOnlyFilter(event.target.checked)}
                  />
                  Burnout only
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={cautionOnlyFilter}
                    onChange={(event) => setCautionOnlyFilter(event.target.checked)}
                  />
                  Caution / blacklist only
                </label>
              </div>
              <div className="pt-6">
                <Button type="button" onClick={() => void loadData()}>
                  Apply Filters
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Volunteer Profile Upsert</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Contact</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={volunteerForm.contactId}
                  onChange={(event) =>
                    setVolunteerForm((prev) => ({ ...prev, contactId: event.target.value }))
                  }
                >
                  <option value="">-- Select contact --</option>
                  {contacts.map((contact) => (
                    <option key={toText(contact.id)} value={toText(contact.id)}>
                      {displayContactName(contact)} ({toText(contact.email) || "no-email"})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={volunteerForm.volunteerStatus}
                  onChange={(event) =>
                    setVolunteerForm((prev) => ({ ...prev, volunteerStatus: event.target.value }))
                  }
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="prospective">Prospective</option>
                  <option value="do_not_schedule">Do Not Schedule</option>
                  <option value="soft_blacklisted">Soft Blacklisted</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={volunteerForm.volunteerType}
                  onChange={(event) =>
                    setVolunteerForm((prev) => ({ ...prev, volunteerType: event.target.value }))
                  }
                >
                  <option value="individual">Individual</option>
                  <option value="minor">Minor</option>
                  <option value="family_member_volunteer">Family Member Volunteer</option>
                  <option value="group_volunteer_participant">Group Volunteer Participant</option>
                  <option value="team_leader">Team Leader</option>
                </select>
              </div>
              <FormInput
                label="Availability Preferences"
                value={volunteerForm.availabilityPreferences}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, availabilityPreferences: value }))}
              />
              <TagTypeaheadMulti
                label="Interests"
                selected={volunteerForm.interests}
                options={interestTagOptions}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, interests: value }))}
                onCreateOption={(value) => createVolunteerTaxonomyTag("Interests", value)}
                placeholder="Type an interest and press Enter..."
              />
              <TagTypeaheadMulti
                label="Skills"
                selected={volunteerForm.skills}
                options={skillTagOptions}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, skills: value }))}
                onCreateOption={(value) => createVolunteerTaxonomyTag("Skills", value)}
                placeholder="Type a skill and press Enter..."
              />
              <TagTypeaheadMulti
                label="Certifications"
                selected={volunteerForm.certifications}
                options={certificationTagOptions}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, certifications: value }))}
                onCreateOption={(value) => createVolunteerTaxonomyTag("Certifications", value)}
                placeholder="Type a certification and press Enter..."
              />
              <FormInput
                label="Accommodations"
                value={volunteerForm.accommodations}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, accommodations: value }))}
                multiline
              />
              <FormInput
                label="Physical Limitations"
                value={volunteerForm.physicalLimitations}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, physicalLimitations: value }))}
                multiline
              />
              <FormInput
                label="Emergency Contact Name"
                value={volunteerForm.emergencyContactName}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, emergencyContactName: value }))}
              />
              <FormInput
                label="Emergency Contact Phone"
                value={volunteerForm.emergencyContactPhone}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, emergencyContactPhone: value }))}
              />
              <FormInput
                label="Do Not Schedule Until"
                type="date"
                value={volunteerForm.doNotScheduleUntil}
                onChange={(value) => setVolunteerForm((prev) => ({ ...prev, doNotScheduleUntil: value }))}
              />
              <FormInput
                label="Background Check Expires"
                type="date"
                value={volunteerForm.backgroundCheckExpiresAt}
                onChange={(value) =>
                  setVolunteerForm((prev) => ({ ...prev, backgroundCheckExpiresAt: value }))
                }
              />
              <FormInput
                label="Orientation Completed"
                type="date"
                value={volunteerForm.orientationCompletedAt}
                onChange={(value) =>
                  setVolunteerForm((prev) => ({ ...prev, orientationCompletedAt: value }))
                }
              />
              <FormInput
                label="Confidentiality Ack Date"
                type="date"
                value={volunteerForm.confidentialityAcknowledgedAt}
                onChange={(value) =>
                  setVolunteerForm((prev) => ({ ...prev, confidentialityAcknowledgedAt: value }))
                }
              />
              <div className="md:col-span-3 grid gap-2 md:grid-cols-4 rounded-md border border-slate-200 p-2">
                <CheckboxField
                  label="Transportation Eligible"
                  checked={volunteerForm.transportationEligible}
                  onChange={(checked) =>
                    setVolunteerForm((prev) => ({ ...prev, transportationEligible: checked }))
                  }
                />
                <CheckboxField
                  label="Driver Eligible"
                  checked={volunteerForm.driverEligible}
                  onChange={(checked) => setVolunteerForm((prev) => ({ ...prev, driverEligible: checked }))}
                />
                <CheckboxField
                  label="Burnout Flag"
                  checked={volunteerForm.burnoutFlag}
                  onChange={(checked) => setVolunteerForm((prev) => ({ ...prev, burnoutFlag: checked }))}
                />
                <CheckboxField
                  label="Caution Flag"
                  checked={volunteerForm.cautionFlag}
                  onChange={(checked) => setVolunteerForm((prev) => ({ ...prev, cautionFlag: checked }))}
                />
                <CheckboxField
                  label="Soft Blacklist"
                  checked={volunteerForm.softBlacklistFlag}
                  onChange={(checked) =>
                    setVolunteerForm((prev) => ({ ...prev, softBlacklistFlag: checked }))
                  }
                />
                <CheckboxField
                  label="Waiver Signed"
                  checked={volunteerForm.waiverSigned}
                  onChange={(checked) => setVolunteerForm((prev) => ({ ...prev, waiverSigned: checked }))}
                />
                <CheckboxField
                  label="Minor Requires Guardian"
                  checked={volunteerForm.minorRequiresGuardianPresent}
                  onChange={(checked) =>
                    setVolunteerForm((prev) => ({ ...prev, minorRequiresGuardianPresent: checked }))
                  }
                />
              </div>
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Internal Notes</label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={volunteerForm.internalNotes}
                  onChange={(event) =>
                    setVolunteerForm((prev) => ({ ...prev, internalNotes: event.target.value }))
                  }
                />
              </div>
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Internal Concerns</label>
                <textarea
                  className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={volunteerForm.internalConcerns}
                  onChange={(event) =>
                    setVolunteerForm((prev) => ({ ...prev, internalConcerns: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="mt-3">
              <Button type="button" onClick={() => void saveVolunteerProfile()} disabled={loading}>
                Save Volunteer Profile
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Volunteer Roster</p>
            <TableView
              headers={[
                "Volunteer",
                "Profile URL",
                "Status",
                "Type",
                "Reliability",
                "Burnout",
                "Caution",
                "Soft Blacklist",
                "Last Activity",
                "Lifetime Hours",
                "YTD Hours"
              ]}
              rows={volunteers.map((volunteer) => {
                const contact = (Array.isArray(volunteer.contacts)
                  ? volunteer.contacts[0]
                  : volunteer.contacts) as Record<string, unknown> | null;
                return [
                  displayContactName(contact),
                  `/staff/volunteer-coordination/volunteers/${toText(volunteer.id)}`,
                  toText(volunteer.volunteer_status),
                  toText(volunteer.volunteer_type),
                  `${toText(volunteer.reliability_indicator)} (${toText(volunteer.reliability_score)})`,
                  Boolean(volunteer.burnout_flag) ? "Yes" : "No",
                  Boolean(volunteer.caution_flag) ? "Yes" : "No",
                  Boolean(volunteer.soft_blacklist_flag) ? "Yes" : "No",
                  toText(volunteer.last_activity_at),
                  toText(volunteer.lifetime_hours),
                  toText(volunteer.ytd_hours)
                ];
              })}
            />
          </div>
        </section>
      ) : null}

      {tab === "events" ? (
        <section className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Create Recurring Event Series</p>
              <div className="grid gap-3 md:grid-cols-2">
                <FormInput
                  label="Series Name"
                  value={seriesForm.seriesName}
                  onChange={(value) => setSeriesForm((prev) => ({ ...prev, seriesName: value }))}
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Pattern</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={seriesForm.recurrencePattern}
                    onChange={(event) =>
                      setSeriesForm((prev) => ({ ...prev, recurrencePattern: event.target.value }))
                    }
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                <FormInput
                  label="Recurrence Interval"
                  type="number"
                  value={String(seriesForm.recurrenceInterval)}
                  onChange={(value) =>
                    setSeriesForm((prev) => ({ ...prev, recurrenceInterval: Number(value || "1") }))
                  }
                />
                <FormInput
                  label="Days of Week (comma values 0-6)"
                  value={seriesForm.recurrenceDaysOfWeek}
                  onChange={(value) => setSeriesForm((prev) => ({ ...prev, recurrenceDaysOfWeek: value }))}
                />
                <FormInput
                  label="Start Date"
                  type="date"
                  value={seriesForm.startsOn}
                  onChange={(value) => setSeriesForm((prev) => ({ ...prev, startsOn: value }))}
                />
                <FormInput
                  label="End Date"
                  type="date"
                  value={seriesForm.endsOn}
                  onChange={(value) => setSeriesForm((prev) => ({ ...prev, endsOn: value }))}
                />
                <FormInput
                  label="Ends After Occurrences"
                  type="number"
                  value={seriesForm.endsAfterOccurrences}
                  onChange={(value) => setSeriesForm((prev) => ({ ...prev, endsAfterOccurrences: value }))}
                />
                <FormInput
                  label="Timezone"
                  value={seriesForm.timezone}
                  onChange={(value) => setSeriesForm((prev) => ({ ...prev, timezone: value }))}
                />
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={seriesForm.notes}
                    onChange={(event) => setSeriesForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-3">
                <Button type="button" onClick={() => void saveSeries()}>
                  Create Series
                </Button>
              </div>
              <div className="mt-4 grid gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Generate From Series</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={seriesGenerateForm.seriesId}
                    onChange={(event) =>
                      setSeriesGenerateForm((prev) => ({ ...prev, seriesId: event.target.value }))
                    }
                  >
                    <option value="">Select series</option>
                    {eventSeries.map((series) => (
                      <option key={String(series.id)} value={String(series.id)}>
                        {toText(series.series_name) || String(series.id)}
                      </option>
                    ))}
                  </select>
                </div>
                <FormInput
                  label="Generate Through Date"
                  type="date"
                  value={seriesGenerateForm.throughDate}
                  onChange={(value) => setSeriesGenerateForm((prev) => ({ ...prev, throughDate: value }))}
                />
                <FormInput
                  label="Max New Occurrences"
                  type="number"
                  value={seriesGenerateForm.maxOccurrences}
                  onChange={(value) => setSeriesGenerateForm((prev) => ({ ...prev, maxOccurrences: value }))}
                />
                <div className="md:col-span-3">
                  <Button type="button" variant="secondary" onClick={() => void generateSeriesInstances()}>
                    Generate Future Event Instances
                  </Button>
                </div>
              </div>
              <div className="mt-3 grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-3">
                <FormInput
                  label="Job Through Date"
                  type="date"
                  value={seriesJobForm.throughDate}
                  onChange={(value) => setSeriesJobForm((prev) => ({ ...prev, throughDate: value }))}
                />
                <FormInput
                  label="Max Occurrences / Series"
                  type="number"
                  value={seriesJobForm.maxOccurrencesPerSeries}
                  onChange={(value) =>
                    setSeriesJobForm((prev) => ({ ...prev, maxOccurrencesPerSeries: value }))
                  }
                />
                <FormInput
                  label="Series Limit per Run"
                  type="number"
                  value={seriesJobForm.limitSeries}
                  onChange={(value) => setSeriesJobForm((prev) => ({ ...prev, limitSeries: value }))}
                />
                <div className="md:col-span-3">
                  <Button type="button" variant="secondary" onClick={() => void runRecurringSeriesJob()}>
                    Run Recurrence Generation Job
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Create / Update Volunteer Event</p>
              <div className="grid gap-3 md:grid-cols-2">
                <FormInput
                  label="Event Name"
                  value={eventForm.eventName}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, eventName: value }))}
                />
                <FormInput
                  label="Event Type"
                  value={eventForm.eventType}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, eventType: value }))}
                />
                <FormInput
                  label="Program / Department"
                  value={eventForm.programDepartment}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, programDepartment: value }))}
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Event Status</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={eventForm.eventStatus}
                    onChange={(event) =>
                      setEventForm((prev) => ({ ...prev, eventStatus: event.target.value }))
                    }
                  >
                    <option value="draft">Draft</option>
                    <option value="recruiting">Recruiting</option>
                    <option value="full">Full</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <FormInput
                  label="Event Date"
                  type="date"
                  value={eventForm.eventDate}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, eventDate: value }))}
                />
                <FormInput
                  label="Start Time"
                  type="time"
                  value={eventForm.startTime}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, startTime: value }))}
                />
                <FormInput
                  label="End Time"
                  type="time"
                  value={eventForm.endTime}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, endTime: value }))}
                />
                <FormInput
                  label="Location"
                  value={eventForm.location}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, location: value }))}
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Visibility</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={eventForm.visibility}
                    onChange={(event) =>
                      setEventForm((prev) => ({ ...prev, visibility: event.target.value }))
                    }
                  >
                    <option value="public">Public</option>
                    <option value="private">Private</option>
                    <option value="internal">Internal</option>
                  </select>
                </div>
                <FormInput
                  label="Capacity Total"
                  type="number"
                  value={String(eventForm.capacityTotal)}
                  onChange={(value) =>
                    setEventForm((prev) => ({ ...prev, capacityTotal: Number(value || "0") }))
                  }
                />
                <FormInput
                  label="Meal Options (comma separated)"
                  value={eventForm.mealOptions}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, mealOptions: value }))}
                />
                <FormInput
                  label="T-Shirt Options (comma separated)"
                  value={eventForm.tshirtOptions}
                  onChange={(value) => setEventForm((prev) => ({ ...prev, tshirtOptions: value }))}
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Series (optional)</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={eventForm.seriesId}
                    onChange={(event) => setEventForm((prev) => ({ ...prev, seriesId: event.target.value }))}
                  >
                    <option value="">-- None --</option>
                    {((data.eventSeries as Array<Record<string, unknown>> | undefined) ?? []).map((series) => (
                      <option key={toText(series.id)} value={toText(series.id)}>
                        {toText(series.series_name)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2 grid gap-2 md:grid-cols-3 rounded-md border border-slate-200 p-2">
                  <CheckboxField
                    label="Family Friendly"
                    checked={eventForm.familyFriendly}
                    onChange={(checked) => setEventForm((prev) => ({ ...prev, familyFriendly: checked }))}
                  />
                  <CheckboxField
                    label="Group Allowed"
                    checked={eventForm.groupAllowed}
                    onChange={(checked) => setEventForm((prev) => ({ ...prev, groupAllowed: checked }))}
                  />
                  <CheckboxField
                    label="Minor Allowed"
                    checked={eventForm.minorAllowed}
                    onChange={(checked) => setEventForm((prev) => ({ ...prev, minorAllowed: checked }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Event Description</label>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={eventForm.eventDescription}
                    onChange={(event) =>
                      setEventForm((prev) => ({ ...prev, eventDescription: event.target.value }))
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={eventForm.notes}
                    onChange={(event) => setEventForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-3">
                <Button type="button" onClick={() => void saveEvent()}>
                  Save Event
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Create / Update Event Role</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Event</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={roleForm.eventId}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, eventId: event.target.value }))}
                >
                  <option value="">-- Select event --</option>
                  {events.map((event) => (
                    <option key={toText(event.id)} value={toText(event.id)}>
                      {toText(event.event_name)} ({toText(event.event_date)})
                    </option>
                  ))}
                </select>
              </div>
              <FormInput
                label="Role Name"
                value={roleForm.roleName}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, roleName: value }))}
              />
              <FormInput
                label="Role Description"
                value={roleForm.roleDescription}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, roleDescription: value }))}
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Parent Role</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={roleForm.parentRoleId}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, parentRoleId: event.target.value }))}
                >
                  <option value="">-- None --</option>
                  {eventRoles
                    .filter((role) => String(role.event_id) === String(roleForm.eventId))
                    .map((role) => (
                      <option key={toText(role.id)} value={toText(role.id)}>
                        {toText(role.role_name)}
                      </option>
                    ))}
                </select>
              </div>
              <FormInput
                label="Shift Start"
                type="time"
                value={roleForm.shiftStart}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, shiftStart: value }))}
              />
              <FormInput
                label="Shift End"
                type="time"
                value={roleForm.shiftEnd}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, shiftEnd: value }))}
              />
              <FormInput
                label="Number Needed"
                type="number"
                value={String(roleForm.numberNeeded)}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, numberNeeded: Number(value || "1") }))}
              />
              <FormInput
                label="Required Skills"
                value={roleForm.requiredSkills}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, requiredSkills: value }))}
              />
              <TagTypeaheadMulti
                label="Required Tags"
                selected={roleForm.requiredTags}
                options={allTagOptions}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, requiredTags: value }))}
                placeholder="Type and select required tags..."
              />
              <FormInput
                label="Required Certifications"
                value={roleForm.requiredCertifications}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, requiredCertifications: value }))}
              />
              <FormInput
                label="Required Training"
                value={roleForm.requiredTraining}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, requiredTraining: value }))}
              />
              <FormInput
                label="Physical Requirements"
                value={roleForm.physicalRequirements}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, physicalRequirements: value }))}
              />
              <FormInput
                label="Check-in Location"
                value={roleForm.checkInLocation}
                onChange={(value) => setRoleForm((prev) => ({ ...prev, checkInLocation: value }))}
              />
              <div className="md:col-span-3 grid gap-2 md:grid-cols-4 rounded-md border border-slate-200 p-2">
                <CheckboxField
                  label="Waitlist Enabled"
                  checked={roleForm.waitlistEnabled}
                  onChange={(checked) => setRoleForm((prev) => ({ ...prev, waitlistEnabled: checked }))}
                />
                <CheckboxField
                  label="Substitute Enabled"
                  checked={roleForm.substituteEnabled}
                  onChange={(checked) => setRoleForm((prev) => ({ ...prev, substituteEnabled: checked }))}
                />
                <CheckboxField
                  label="Lead Role"
                  checked={roleForm.isLeadRole}
                  onChange={(checked) => setRoleForm((prev) => ({ ...prev, isLeadRole: checked }))}
                />
                <CheckboxField
                  label="Background Check Required"
                  checked={roleForm.backgroundCheckRequired}
                  onChange={(checked) =>
                    setRoleForm((prev) => ({ ...prev, backgroundCheckRequired: checked }))
                  }
                />
                <CheckboxField
                  label="Driver Eligibility Required"
                  checked={roleForm.driverEligibilityRequired}
                  onChange={(checked) =>
                    setRoleForm((prev) => ({ ...prev, driverEligibilityRequired: checked }))
                  }
                />
                <CheckboxField
                  label="Minor Allowed"
                  checked={roleForm.minorAllowed}
                  onChange={(checked) => setRoleForm((prev) => ({ ...prev, minorAllowed: checked }))}
                />
                <CheckboxField
                  label="Family Allowed"
                  checked={roleForm.familyMemberAllowed}
                  onChange={(checked) =>
                    setRoleForm((prev) => ({ ...prev, familyMemberAllowed: checked }))
                  }
                />
                <CheckboxField
                  label="Group Allowed"
                  checked={roleForm.groupParticipantAllowed}
                  onChange={(checked) =>
                    setRoleForm((prev) => ({ ...prev, groupParticipantAllowed: checked }))
                  }
                />
              </div>
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Role Notes</label>
                <textarea
                  className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={roleForm.notes}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
            </div>
            <div className="mt-3">
              <Button type="button" onClick={() => void saveRole()}>
                Save Role
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Events</p>
            <TableView
              headers={[
                "Event",
                "Detail URL",
                "Type",
                "Program",
                "Status",
                "Date",
                "Time",
                "Location",
                "Capacity",
                "Family",
                "Group",
                "Minor"
              ]}
              rows={events.map((event) => [
                toText(event.event_name),
                `/staff/volunteer-coordination/events/${toText(event.id)}`,
                toText(event.event_type),
                toText(event.program_department),
                toText(event.event_status),
                toText(event.event_date),
                `${toText(event.start_time)} - ${toText(event.end_time)}`,
                toText(event.location),
                `${toText(event.capacity_filled) || "0"} / ${toText(event.capacity_total) || "0"}`,
                Boolean(event.family_friendly) ? "Yes" : "No",
                Boolean(event.group_allowed) ? "Yes" : "No",
                Boolean(event.minor_allowed) ? "Yes" : "No"
              ])}
            />
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Event Roles</p>
            <TableView
              headers={[
                "Event",
                "Role",
                "Lead",
                "Shift",
                "Needed",
                "Filled",
                "Waitlist",
                "Substitute",
                "Minor",
                "Driver Req"
              ]}
              rows={eventRoles.map((role) => {
                const event = events.find((entry) => String(entry.id) === String(role.event_id));
                return [
                  toText(event?.event_name) || toText(role.event_id),
                  toText(role.role_name),
                  Boolean(role.is_lead_role) ? "Yes" : "No",
                  `${toText(role.shift_start)} - ${toText(role.shift_end)}`,
                  toText(role.number_needed) || "0",
                  toText(role.number_filled) || "0",
                  Boolean(role.waitlist_enabled) ? "Yes" : "No",
                  Boolean(role.substitute_enabled) ? "Yes" : "No",
                  Boolean(role.minor_allowed) ? "Yes" : "No",
                  Boolean(role.driver_eligibility_required) ? "Yes" : "No"
                ];
              })}
            />
          </div>
        </section>
      ) : null}

      {tab === "assignments" ? (
        <section className="space-y-3">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Assignment Management</p>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Volunteer</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={assignmentForm.volunteerProfileId}
                  onChange={(event) =>
                    setAssignmentForm((prev) => ({ ...prev, volunteerProfileId: event.target.value }))
                  }
                >
                  <option value="">-- Select volunteer --</option>
                  {volunteers.map((volunteer) => {
                    const contact = (Array.isArray(volunteer.contacts)
                      ? volunteer.contacts[0]
                      : volunteer.contacts) as Record<string, unknown> | null;
                    return (
                      <option key={toText(volunteer.id)} value={toText(volunteer.id)}>
                        {displayContactName(contact)} ({toText(volunteer.volunteer_status)})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Event</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={assignmentForm.eventId}
                  onChange={(event) =>
                    setAssignmentForm((prev) => ({ ...prev, eventId: event.target.value }))
                  }
                >
                  <option value="">-- Select event --</option>
                  {events.map((event) => (
                    <option key={toText(event.id)} value={toText(event.id)}>
                      {toText(event.event_name)} ({toText(event.event_date)})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Role</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={assignmentForm.roleId}
                  onChange={(event) =>
                    setAssignmentForm((prev) => ({ ...prev, roleId: event.target.value }))
                  }
                >
                  <option value="">-- Optional role --</option>
                  {eventRoles
                    .filter(
                      (role) =>
                        !assignmentForm.eventId || String(role.event_id) === String(assignmentForm.eventId)
                    )
                    .map((role) => (
                      <option key={toText(role.id)} value={toText(role.id)}>
                        {toText(role.role_name)}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Assignment Status</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={assignmentForm.assignmentStatus}
                  onChange={(event) =>
                    setAssignmentForm((prev) => ({ ...prev, assignmentStatus: event.target.value }))
                  }
                >
                  <option value="invited">Invited</option>
                  <option value="interested">Interested</option>
                  <option value="pending_approval">Pending Approval</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="waitlisted">Waitlisted</option>
                  <option value="substitute">Substitute</option>
                  <option value="cancelled">Cancelled</option>
                  <option value="declined">Declined</option>
                  <option value="no_show">No Show</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <FormInput
                label="Scheduled Hours"
                type="number"
                value={assignmentForm.scheduledHours}
                onChange={(value) => setAssignmentForm((prev) => ({ ...prev, scheduledHours: value }))}
              />
              <FormInput
                label="Actual Hours"
                type="number"
                value={assignmentForm.actualHours}
                onChange={(value) => setAssignmentForm((prev) => ({ ...prev, actualHours: value }))}
              />
              <FormInput
                label="Check-in Timestamp"
                type="datetime-local"
                value={assignmentForm.checkInAt}
                onChange={(value) => setAssignmentForm((prev) => ({ ...prev, checkInAt: value }))}
              />
              <FormInput
                label="Check-out Timestamp"
                type="datetime-local"
                value={assignmentForm.checkOutAt}
                onChange={(value) => setAssignmentForm((prev) => ({ ...prev, checkOutAt: value }))}
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Approval Status</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={assignmentForm.approvalStatus}
                  onChange={(event) =>
                    setAssignmentForm((prev) => ({ ...prev, approvalStatus: event.target.value }))
                  }
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="md:col-span-3 grid gap-2 md:grid-cols-4 rounded-md border border-slate-200 p-2">
                <CheckboxField
                  label="Late Arrival"
                  checked={assignmentForm.isLateArrival}
                  onChange={(checked) =>
                    setAssignmentForm((prev) => ({ ...prev, isLateArrival: checked }))
                  }
                />
                <CheckboxField
                  label="Early Departure"
                  checked={assignmentForm.isEarlyDeparture}
                  onChange={(checked) =>
                    setAssignmentForm((prev) => ({ ...prev, isEarlyDeparture: checked }))
                  }
                />
                <CheckboxField
                  label="Late Cancelled"
                  checked={assignmentForm.lateCancelled}
                  onChange={(checked) =>
                    setAssignmentForm((prev) => ({ ...prev, lateCancelled: checked }))
                  }
                />
              </div>
              <FormInput
                label="No-Show Reason"
                value={assignmentForm.noShowReason}
                onChange={(value) => setAssignmentForm((prev) => ({ ...prev, noShowReason: value }))}
              />
              <div className="md:col-span-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                <textarea
                  className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={assignmentForm.notes}
                  onChange={(event) => setAssignmentForm((prev) => ({ ...prev, notes: event.target.value }))}
                />
              </div>
            </div>
            <div className="mt-3">
              <Button type="button" onClick={() => void saveAssignment()}>
                Save Assignment
              </Button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Waitlist Management</p>
              <div className="grid gap-2 md:grid-cols-2">
                <SelectField
                  label="Event"
                  value={waitlistForm.eventId}
                  onChange={(value) => setWaitlistForm((prev) => ({ ...prev, eventId: value }))}
                  options={events.map((event) => ({
                    value: toText(event.id),
                    label: `${toText(event.event_name)} (${toText(event.event_date)})`
                  }))}
                  placeholder="-- Select event --"
                />
                <SelectField
                  label="Role"
                  value={waitlistForm.roleId}
                  onChange={(value) => setWaitlistForm((prev) => ({ ...prev, roleId: value }))}
                  options={eventRoles
                    .filter(
                      (role) => !waitlistForm.eventId || String(role.event_id) === String(waitlistForm.eventId)
                    )
                    .map((role) => ({
                      value: toText(role.id),
                      label: toText(role.role_name)
                    }))}
                  placeholder="-- Select role --"
                />
                <SelectField
                  label="Volunteer"
                  value={waitlistForm.volunteerProfileId}
                  onChange={(value) =>
                    setWaitlistForm((prev) => ({ ...prev, volunteerProfileId: value }))
                  }
                  options={volunteers.map((volunteer) => {
                    const contact = (Array.isArray(volunteer.contacts)
                      ? volunteer.contacts[0]
                      : volunteer.contacts) as Record<string, unknown> | null;
                    return {
                      value: toText(volunteer.id),
                      label: displayContactName(contact)
                    };
                  })}
                  placeholder="-- Select volunteer --"
                />
                <FormInput
                  label="Order"
                  type="number"
                  value={waitlistForm.waitlistOrder}
                  onChange={(value) => setWaitlistForm((prev) => ({ ...prev, waitlistOrder: value }))}
                />
              </div>
              <div className="mt-2">
                <Button type="button" variant="secondary" onClick={() => void saveWaitlistEntry()}>
                  Save Waitlist Entry
                </Button>
              </div>
              <TableView
                headers={["Event", "Role", "Volunteer", "Order", "Status"]}
                rows={waitlist.map((entry) => {
                  const volunteer = volunteers.find((item) => String(item.id) === String(entry.volunteer_profile_id));
                  const contact = volunteer
                    ? ((Array.isArray(volunteer.contacts)
                        ? volunteer.contacts[0]
                        : volunteer.contacts) as Record<string, unknown> | null)
                    : null;
                  return [
                    toText(
                      (Array.isArray(entry.volunteer_events)
                        ? entry.volunteer_events[0]
                        : entry.volunteer_events as Record<string, unknown> | null)?.event_name
                    ),
                    toText(
                      (Array.isArray(entry.volunteer_event_roles)
                        ? entry.volunteer_event_roles[0]
                        : entry.volunteer_event_roles as Record<string, unknown> | null)?.role_name
                    ),
                    displayContactName(contact),
                    toText(entry.waitlist_order),
                    toText(entry.entry_status)
                  ];
                })}
              />
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Substitute Pool</p>
              <div className="grid gap-2 md:grid-cols-2">
                <SelectField
                  label="Event"
                  value={substituteForm.eventId}
                  onChange={(value) => setSubstituteForm((prev) => ({ ...prev, eventId: value }))}
                  options={events.map((event) => ({
                    value: toText(event.id),
                    label: `${toText(event.event_name)} (${toText(event.event_date)})`
                  }))}
                  placeholder="-- Select event --"
                />
                <SelectField
                  label="Role"
                  value={substituteForm.roleId}
                  onChange={(value) => setSubstituteForm((prev) => ({ ...prev, roleId: value }))}
                  options={eventRoles
                    .filter(
                      (role) =>
                        !substituteForm.eventId || String(role.event_id) === String(substituteForm.eventId)
                    )
                    .map((role) => ({
                      value: toText(role.id),
                      label: toText(role.role_name)
                    }))}
                  placeholder="-- Optional role --"
                />
                <SelectField
                  label="Volunteer"
                  value={substituteForm.volunteerProfileId}
                  onChange={(value) =>
                    setSubstituteForm((prev) => ({ ...prev, volunteerProfileId: value }))
                  }
                  options={volunteers.map((volunteer) => {
                    const contact = (Array.isArray(volunteer.contacts)
                      ? volunteer.contacts[0]
                      : volunteer.contacts) as Record<string, unknown> | null;
                    return {
                      value: toText(volunteer.id),
                      label: displayContactName(contact)
                    };
                  })}
                  placeholder="-- Select volunteer --"
                />
                <FormInput
                  label="Priority"
                  type="number"
                  value={substituteForm.priorityOrder}
                  onChange={(value) =>
                    setSubstituteForm((prev) => ({ ...prev, priorityOrder: value }))
                  }
                />
              </div>
              <div className="mt-2">
                <Button type="button" variant="secondary" onClick={() => void saveSubstituteEntry()}>
                  Save Substitute Entry
                </Button>
              </div>
              <TableView
                headers={["Event", "Role", "Volunteer", "Priority", "Availability"]}
                rows={substitutes.map((entry) => {
                  const volunteer = volunteers.find((item) => String(item.id) === String(entry.volunteer_profile_id));
                  const contact = volunteer
                    ? ((Array.isArray(volunteer.contacts)
                        ? volunteer.contacts[0]
                        : volunteer.contacts) as Record<string, unknown> | null)
                    : null;
                  return [
                    toText(
                      (Array.isArray(entry.volunteer_events)
                        ? entry.volunteer_events[0]
                        : entry.volunteer_events as Record<string, unknown> | null)?.event_name
                    ),
                    toText(
                      (Array.isArray(entry.volunteer_event_roles)
                        ? entry.volunteer_event_roles[0]
                        : entry.volunteer_event_roles as Record<string, unknown> | null)?.role_name
                    ),
                    displayContactName(contact),
                    toText(entry.priority_order),
                    toText(entry.availability_status)
                  ];
                })}
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Assignment Log</p>
            <TableView
              headers={[
                "Volunteer",
                "Event",
                "Role",
                "Status",
                "Approval",
                "Scheduled",
                "Actual",
                "Check-in",
                "Check-out",
                "No-Show Reason"
              ]}
              rows={assignments.map((assignment) => {
                const volunteer = volunteers.find(
                  (item) => String(item.id) === String(assignment.volunteer_profile_id)
                );
                const contact = volunteer
                  ? ((Array.isArray(volunteer.contacts)
                      ? volunteer.contacts[0]
                      : volunteer.contacts) as Record<string, unknown> | null)
                  : null;
                return [
                  displayContactName(contact),
                  toText(
                    (Array.isArray(assignment.volunteer_events)
                      ? assignment.volunteer_events[0]
                      : assignment.volunteer_events as Record<string, unknown> | null)?.event_name
                  ),
                  toText(
                    (Array.isArray(assignment.volunteer_event_roles)
                      ? assignment.volunteer_event_roles[0]
                      : assignment.volunteer_event_roles as Record<string, unknown> | null)?.role_name
                  ),
                  toText(assignment.assignment_status),
                  toText(assignment.approval_status),
                  toText(assignment.scheduled_hours),
                  toText(assignment.actual_hours),
                  toText(assignment.check_in_at),
                  toText(assignment.check_out_at),
                  toText(assignment.no_show_reason)
                ];
              })}
            />
          </div>
        </section>
      ) : null}

      {tab === "families-groups" ? (
        <section className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Families</p>
              <div className="grid gap-2 md:grid-cols-2">
                <FormInput
                  label="Family Name"
                  value={familyForm.familyName}
                  onChange={(value) => setFamilyForm((prev) => ({ ...prev, familyName: value }))}
                />
                <CheckboxField
                  label="Must Serve Together"
                  checked={familyForm.mustServeTogether}
                  onChange={(checked) =>
                    setFamilyForm((prev) => ({ ...prev, mustServeTogether: checked }))
                  }
                />
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={familyForm.notes}
                    onChange={(event) => setFamilyForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-2">
                <Button type="button" onClick={() => void saveFamily()}>
                  Save Family
                </Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <SelectField
                  label="Family"
                  value={familyMemberForm.familyId}
                  onChange={(value) =>
                    setFamilyMemberForm((prev) => ({ ...prev, familyId: value }))
                  }
                  options={families.map((family) => ({
                    value: toText(family.id),
                    label: toText(family.family_name)
                  }))}
                  placeholder="-- Select family --"
                />
                <SelectField
                  label="Contact"
                  value={familyMemberForm.contactId}
                  onChange={(value) =>
                    setFamilyMemberForm((prev) => ({ ...prev, contactId: value }))
                  }
                  options={contacts.map((contact) => ({
                    value: toText(contact.id),
                    label: displayContactName(contact)
                  }))}
                  placeholder="-- Select contact --"
                />
              </div>
              <div className="mt-2">
                <Button type="button" variant="secondary" onClick={() => void saveFamilyMember()}>
                  Link Family Member
                </Button>
              </div>
              <TableView
                headers={["Family", "Must Serve Together", "Members"]}
                rows={families.map((family) => [
                  toText(family.family_name),
                  Boolean(family.must_serve_together) ? "Yes" : "No",
                  String(
                    ((family.volunteer_family_members as Array<Record<string, unknown>> | undefined) ?? [])
                      .length
                  )
                ])}
              />
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Groups</p>
              <div className="grid gap-2 md:grid-cols-2">
                <FormInput
                  label="Group Name"
                  value={groupForm.groupName}
                  onChange={(value) => setGroupForm((prev) => ({ ...prev, groupName: value }))}
                />
                <FormInput
                  label="Group Type"
                  value={groupForm.groupType}
                  onChange={(value) => setGroupForm((prev) => ({ ...prev, groupType: value }))}
                />
                <SelectField
                  label="Coordinator Contact"
                  value={groupForm.coordinatorContactId}
                  onChange={(value) =>
                    setGroupForm((prev) => ({ ...prev, coordinatorContactId: value }))
                  }
                  options={contacts.map((contact) => ({
                    value: toText(contact.id),
                    label: displayContactName(contact)
                  }))}
                  placeholder="-- Optional --"
                />
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Group Status</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={groupForm.groupStatus}
                    onChange={(event) =>
                      setGroupForm((prev) => ({ ...prev, groupStatus: event.target.value }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <FormInput
                  label="Estimated Attendance"
                  type="number"
                  value={groupForm.estimatedAttendance}
                  onChange={(value) =>
                    setGroupForm((prev) => ({ ...prev, estimatedAttendance: value }))
                  }
                />
                <FormInput
                  label="Confirmed Attendance"
                  type="number"
                  value={groupForm.confirmedAttendance}
                  onChange={(value) =>
                    setGroupForm((prev) => ({ ...prev, confirmedAttendance: value }))
                  }
                />
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                  <textarea
                    className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={groupForm.notes}
                    onChange={(event) => setGroupForm((prev) => ({ ...prev, notes: event.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-2">
                <Button type="button" onClick={() => void saveGroup()}>
                  Save Group
                </Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <SelectField
                  label="Group"
                  value={groupMemberForm.groupId}
                  onChange={(value) => setGroupMemberForm((prev) => ({ ...prev, groupId: value }))}
                  options={groups.map((group) => ({
                    value: toText(group.id),
                    label: toText(group.group_name)
                  }))}
                  placeholder="-- Select group --"
                />
                <SelectField
                  label="Contact (optional)"
                  value={groupMemberForm.contactId}
                  onChange={(value) => setGroupMemberForm((prev) => ({ ...prev, contactId: value }))}
                  options={contacts.map((contact) => ({
                    value: toText(contact.id),
                    label: displayContactName(contact)
                  }))}
                  placeholder="-- Placeholder participant --"
                />
                <FormInput
                  label="Display Name (for placeholder)"
                  value={groupMemberForm.displayName}
                  onChange={(value) =>
                    setGroupMemberForm((prev) => ({ ...prev, displayName: value }))
                  }
                />
                <CheckboxField
                  label="Is Placeholder"
                  checked={groupMemberForm.isPlaceholder}
                  onChange={(checked) =>
                    setGroupMemberForm((prev) => ({ ...prev, isPlaceholder: checked }))
                  }
                />
              </div>
              <div className="mt-2">
                <Button type="button" variant="secondary" onClick={() => void saveGroupMember()}>
                  Save Group Member
                </Button>
              </div>
              <TableView
                headers={["Group", "Type", "Status", "Estimated", "Confirmed", "Participants"]}
                rows={groups.map((group) => [
                  toText(group.group_name),
                  toText(group.group_type),
                  toText(group.group_status),
                  toText(group.estimated_attendance),
                  toText(group.confirmed_attendance),
                  String(
                    ((group.volunteer_group_members as Array<Record<string, unknown>> | undefined) ?? []).length
                  )
                ])}
              />
            </div>
          </div>
        </section>
      ) : null}

      {tab === "hours" ? (
        <section className="space-y-3">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Volunteer Hours Import (Event-Scoped)</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SelectField
                label="Event"
                value={hourImportEventId}
                onChange={(value) => setHourImportEventId(value)}
                options={events.map((event) => ({
                  value: toText(event.id),
                  label: `${toText(event.event_name)} (${toText(event.event_date)})`
                }))}
                placeholder="-- Select event --"
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Upload spreadsheet</label>
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => void handleHoursFileUpload(event.target.files?.[0] ?? null)}
                />
              </div>
              {hourImportSheetNames.length > 0 ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Worksheet</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={hourImportSelectedSheet}
                    onChange={async (event) => {
                      const selected = event.target.value;
                      setHourImportSelectedSheet(selected);
                      const file = (document.querySelector(
                        'input[type="file"]'
                      ) as HTMLInputElement | null)?.files?.[0];
                      if (file) await reloadHoursWorkbookSheet(file, selected);
                    }}
                  >
                    {hourImportSheetNames.map((sheet) => (
                      <option key={sheet} value={sheet}>
                        {sheet}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                File: {hourImportFileName || "-"}
                <br />
                Rows: {hourImportRows.length}
                <br />
                Headers: {hourImportHeaders.length}
              </div>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <ColumnSelect
                label="Volunteer Name"
                value={hourImportMapping.volunteerNameColumn}
                headers={hourImportHeaders}
                onChange={(value) => setHourImportMapping((prev) => ({ ...prev, volunteerNameColumn: value }))}
              />
              <ColumnSelect
                label="Contact Identifier"
                value={hourImportMapping.contactIdentifierColumn}
                headers={hourImportHeaders}
                onChange={(value) =>
                  setHourImportMapping((prev) => ({ ...prev, contactIdentifierColumn: value }))
                }
              />
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Contact Match Field</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={hourImportMapping.contactMatchField}
                  onChange={(event) =>
                    setHourImportMapping((prev) => ({
                      ...prev,
                      contactMatchField: event.target.value as "email" | "phone" | "external_source_id"
                    }))
                  }
                >
                  <option value="email">Email</option>
                  <option value="phone">Phone</option>
                  <option value="external_source_id">External Source ID</option>
                </select>
              </div>
              <ColumnSelect
                label="Role"
                value={hourImportMapping.roleColumn}
                headers={hourImportHeaders}
                onChange={(value) => setHourImportMapping((prev) => ({ ...prev, roleColumn: value }))}
              />
              <ColumnSelect
                label="Date"
                value={hourImportMapping.dateColumn}
                headers={hourImportHeaders}
                onChange={(value) => setHourImportMapping((prev) => ({ ...prev, dateColumn: value }))}
              />
              <ColumnSelect
                label="Check-in"
                value={hourImportMapping.checkInColumn}
                headers={hourImportHeaders}
                onChange={(value) => setHourImportMapping((prev) => ({ ...prev, checkInColumn: value }))}
              />
              <ColumnSelect
                label="Check-out"
                value={hourImportMapping.checkOutColumn}
                headers={hourImportHeaders}
                onChange={(value) => setHourImportMapping((prev) => ({ ...prev, checkOutColumn: value }))}
              />
              <ColumnSelect
                label="Hours"
                value={hourImportMapping.hoursColumn}
                headers={hourImportHeaders}
                onChange={(value) => setHourImportMapping((prev) => ({ ...prev, hoursColumn: value }))}
              />
              <ColumnSelect
                label="Attendance Status"
                value={hourImportMapping.attendanceStatusColumn}
                headers={hourImportHeaders}
                onChange={(value) =>
                  setHourImportMapping((prev) => ({ ...prev, attendanceStatusColumn: value }))
                }
              />
              <ColumnSelect
                label="Notes"
                value={hourImportMapping.notesColumn}
                headers={hourImportHeaders}
                onChange={(value) => setHourImportMapping((prev) => ({ ...prev, notesColumn: value }))}
              />
            </div>

            {hourImportPreviewRows.length > 0 ? (
              <div className="mt-3 max-h-52 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
                <pre>{JSON.stringify(hourImportPreviewRows, null, 2)}</pre>
              </div>
            ) : null}

            <div className="mt-3 flex gap-2">
              <Button type="button" onClick={() => void stageHourImport()}>
                Stage Import Rows
              </Button>
              <Button type="button" variant="secondary" onClick={() => void commitHourImport()}>
                Finalize / Commit Staged Rows
              </Button>
            </div>
          </div>

          {stagedImport ? (
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Staged Import Review</p>
              <p className="text-xs text-slate-700">
                Import ID: {toText(stagedImport.id)} | Staged: {toText(stagedImport.rows_staged)} | Committed:{" "}
                {toText(stagedImport.rows_committed)} | Skipped: {toText(stagedImport.rows_skipped)} | Errors:{" "}
                {toText(stagedImport.rows_error)}
              </p>
              <div className="mt-3 max-h-80 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-3">Row</th>
                      <th className="py-2 pr-3">Stage Status</th>
                      <th className="py-2 pr-3">Volunteer Name</th>
                      <th className="py-2 pr-3">Matched Contact</th>
                      <th className="py-2 pr-3">Matched Volunteer Profile</th>
                      <th className="py-2 pr-3">Service Date</th>
                      <th className="py-2 pr-3">Hours</th>
                      <th className="py-2 pr-3">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stagedRows.map((row) => {
                      const rawRow = (row.raw_row as Record<string, unknown> | null) ?? {};
                      const volunteerName = toText(rawRow[toText(hourImportMapping.volunteerNameColumn)]);
                      return (
                        <tr key={toText(row.id)} className="border-b border-slate-100">
                          <td className="py-2 pr-3">{toText(row.row_index)}</td>
                          <td className="py-2 pr-3">{toText(row.stage_status)}</td>
                          <td className="py-2 pr-3">{volunteerName || "-"}</td>
                          <td className="py-2 pr-3">
                            <select
                              className="w-48 rounded-md border border-slate-300 px-2 py-1 text-xs"
                              value={toText(row.matched_contact_id)}
                              onChange={(event) =>
                                void updateStagedRowMatch(String(row.id), event.target.value || "")
                              }
                            >
                              <option value="">-- Unmatched --</option>
                              {contacts.map((contact) => (
                                <option key={toText(contact.id)} value={toText(contact.id)}>
                                  {displayContactName(contact)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 pr-3">{toText(row.matched_volunteer_profile_id) || "-"}</td>
                          <td className="py-2 pr-3">{toText(row.service_date) || "-"}</td>
                          <td className="py-2 pr-3">{toText(row.hours) || "-"}</td>
                          <td className="py-2 pr-3 text-red-700">{toText(row.error_message) || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Import Audit History</p>
            <TableView
              headers={[
                "Import ID",
                "Event",
                "Status",
                "Filename",
                "Imported At",
                "Rows Staged",
                "Rows Committed",
                "Rows Skipped",
                "Rows Error"
              ]}
              rows={((data.hourImports as Array<Record<string, unknown>> | undefined) ?? []).map((entry) => [
                toText(entry.id),
                toText(
                  (Array.isArray(entry.volunteer_events)
                    ? entry.volunteer_events[0]
                    : entry.volunteer_events as Record<string, unknown> | null)?.event_name
                ),
                toText(entry.import_status),
                toText(entry.source_filename),
                toText(entry.imported_at),
                toText(entry.rows_staged),
                toText(entry.rows_committed),
                toText(entry.rows_skipped),
                toText(entry.rows_error)
              ])}
            />
          </div>
        </section>
      ) : null}

      {tab === "safety" ? (
        <section className="space-y-3">
          {!canViewSensitive ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Your current role can view operational volunteer data, but not sensitive safety/compliance
              records.
            </p>
          ) : null}

          {canViewSensitive ? (
            <>
              <div className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Compliance Tracking</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <SelectField
                      label="Volunteer"
                      value={complianceForm.volunteerProfileId}
                      onChange={(value) =>
                        setComplianceForm((prev) => ({ ...prev, volunteerProfileId: value }))
                      }
                      options={volunteers.map((volunteer) => {
                        const contact = (Array.isArray(volunteer.contacts)
                          ? volunteer.contacts[0]
                          : volunteer.contacts) as Record<string, unknown> | null;
                        return {
                          value: toText(volunteer.id),
                          label: displayContactName(contact)
                        };
                      })}
                      placeholder="-- Select volunteer --"
                    />
                    <FormInput
                      label="Compliance Type"
                      value={complianceForm.complianceType}
                      onChange={(value) =>
                        setComplianceForm((prev) => ({ ...prev, complianceType: value }))
                      }
                    />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                      <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={complianceForm.complianceStatus}
                        onChange={(event) =>
                          setComplianceForm((prev) => ({ ...prev, complianceStatus: event.target.value }))
                        }
                      >
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="expired">Expired</option>
                        <option value="exempt">Exempt</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <FormInput
                      label="Completed At"
                      type="date"
                      value={complianceForm.completedAt}
                      onChange={(value) => setComplianceForm((prev) => ({ ...prev, completedAt: value }))}
                    />
                    <FormInput
                      label="Expires At"
                      type="date"
                      value={complianceForm.expiresAt}
                      onChange={(value) => setComplianceForm((prev) => ({ ...prev, expiresAt: value }))}
                    />
                    <FormInput
                      label="Required for Roles"
                      value={complianceForm.requiredForRoles}
                      onChange={(value) =>
                        setComplianceForm((prev) => ({ ...prev, requiredForRoles: value }))
                      }
                    />
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                      <textarea
                        className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={complianceForm.notes}
                        onChange={(event) =>
                          setComplianceForm((prev) => ({ ...prev, notes: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-2">
                    <Button type="button" onClick={() => void saveComplianceItem()}>
                      Save Compliance Item
                    </Button>
                  </div>
                  <TableView
                    headers={["Volunteer", "Type", "Status", "Completed", "Expires", "Notes"]}
                    rows={complianceItems.map((entry) => {
                      const volunteer = volunteers.find(
                        (item) => String(item.id) === String(entry.volunteer_profile_id)
                      );
                      const contact = volunteer
                        ? ((Array.isArray(volunteer.contacts)
                            ? volunteer.contacts[0]
                            : volunteer.contacts) as Record<string, unknown> | null)
                        : null;
                      return [
                        displayContactName(contact),
                        toText(entry.compliance_type),
                        toText(entry.compliance_status),
                        toText(entry.completed_at),
                        toText(entry.expires_at),
                        toText(entry.notes)
                      ];
                    })}
                  />
                </div>

                <div className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Concerns & Burnout Flags</p>
                  <div className="grid gap-2 md:grid-cols-2">
                    <SelectField
                      label="Volunteer (Concern)"
                      value={concernForm.volunteerProfileId}
                      onChange={(value) =>
                        setConcernForm((prev) => ({ ...prev, volunteerProfileId: value }))
                      }
                      options={volunteers.map((volunteer) => {
                        const contact = (Array.isArray(volunteer.contacts)
                          ? volunteer.contacts[0]
                          : volunteer.contacts) as Record<string, unknown> | null;
                        return {
                          value: toText(volunteer.id),
                          label: displayContactName(contact)
                        };
                      })}
                      placeholder="-- Select volunteer --"
                    />
                    <FormInput
                      label="Concern Category"
                      value={concernForm.concernCategory}
                      onChange={(value) =>
                        setConcernForm((prev) => ({ ...prev, concernCategory: value }))
                      }
                    />
                    <FormInput
                      label="Concern Type"
                      value={concernForm.concernType}
                      onChange={(value) => setConcernForm((prev) => ({ ...prev, concernType: value }))}
                    />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Severity</label>
                      <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={concernForm.severity}
                        onChange={(event) =>
                          setConcernForm((prev) => ({ ...prev, severity: event.target.value }))
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Action Level</label>
                      <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={concernForm.actionLevel}
                        onChange={(event) =>
                          setConcernForm((prev) => ({ ...prev, actionLevel: event.target.value }))
                        }
                      >
                        <option value="caution_only">Caution Only</option>
                        <option value="role_restricted">Role Restricted</option>
                        <option value="event_restricted">Event Restricted</option>
                        <option value="temporarily_do_not_schedule">Temporarily Do Not Schedule</option>
                        <option value="soft_blacklisted">Soft Blacklisted</option>
                      </select>
                    </div>
                    <FormInput
                      label="Concern Date"
                      type="date"
                      value={concernForm.concernDate}
                      onChange={(value) => setConcernForm((prev) => ({ ...prev, concernDate: value }))}
                    />
                    <FormInput
                      label="Role Restrictions"
                      value={concernForm.roleRestrictions}
                      onChange={(value) =>
                        setConcernForm((prev) => ({ ...prev, roleRestrictions: value }))
                      }
                    />
                    <FormInput
                      label="Event Restrictions"
                      value={concernForm.eventRestrictions}
                      onChange={(value) =>
                        setConcernForm((prev) => ({ ...prev, eventRestrictions: value }))
                      }
                    />
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
                      <textarea
                        className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={concernForm.notes}
                        onChange={(event) => setConcernForm((prev) => ({ ...prev, notes: event.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" onClick={() => void saveConcern()}>
                      Save Concern
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 rounded-md border border-slate-200 p-2">
                    <SelectField
                      label="Volunteer (Burnout)"
                      value={burnoutForm.volunteerProfileId}
                      onChange={(value) =>
                        setBurnoutForm((prev) => ({ ...prev, volunteerProfileId: value }))
                      }
                      options={volunteers.map((volunteer) => {
                        const contact = (Array.isArray(volunteer.contacts)
                          ? volunteer.contacts[0]
                          : volunteer.contacts) as Record<string, unknown> | null;
                        return {
                          value: toText(volunteer.id),
                          label: displayContactName(contact)
                        };
                      })}
                      placeholder="-- Select volunteer --"
                    />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                      <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={burnoutForm.status}
                        onChange={(event) =>
                          setBurnoutForm((prev) => ({ ...prev, status: event.target.value }))
                        }
                      >
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="resolved">Resolved</option>
                      </select>
                    </div>
                    <FormInput
                      label="Pause Days"
                      type="number"
                      value={burnoutForm.pauseDays}
                      onChange={(value) => setBurnoutForm((prev) => ({ ...prev, pauseDays: value }))}
                    />
                    <FormInput
                      label="Pause Until"
                      type="date"
                      value={burnoutForm.pauseUntil}
                      onChange={(value) => setBurnoutForm((prev) => ({ ...prev, pauseUntil: value }))}
                    />
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600">Reason</label>
                      <textarea
                        className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={burnoutForm.reason}
                        onChange={(event) =>
                          setBurnoutForm((prev) => ({ ...prev, reason: event.target.value }))
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Button type="button" variant="secondary" onClick={() => void saveBurnoutFlag()}>
                        Save Burnout Flag
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">Incident Reporting</p>
                <div className="grid gap-2 md:grid-cols-3">
                  <SelectField
                    label="Event"
                    value={incidentForm.eventId}
                    onChange={(value) => setIncidentForm((prev) => ({ ...prev, eventId: value }))}
                    options={events.map((event) => ({
                      value: toText(event.id),
                      label: `${toText(event.event_name)} (${toText(event.event_date)})`
                    }))}
                    placeholder="-- Optional --"
                  />
                  <SelectField
                    label="Role"
                    value={incidentForm.roleId}
                    onChange={(value) => setIncidentForm((prev) => ({ ...prev, roleId: value }))}
                    options={eventRoles.map((role) => ({
                      value: toText(role.id),
                      label: toText(role.role_name)
                    }))}
                    placeholder="-- Optional --"
                  />
                  <SelectField
                    label="Assignment"
                    value={incidentForm.assignmentId}
                    onChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, assignmentId: value }))
                    }
                    options={assignments.map((assignment) => ({
                      value: toText(assignment.id),
                      label: `${toText(assignment.assignment_status)} / ${toText(assignment.event_id)}`
                    }))}
                    placeholder="-- Optional --"
                  />
                  <FormInput
                    label="Incident Date/Time"
                    type="datetime-local"
                    value={incidentForm.incidentAt}
                    onChange={(value) => setIncidentForm((prev) => ({ ...prev, incidentAt: value }))}
                  />
                  <FormInput
                    label="Category"
                    value={incidentForm.incidentCategory}
                    onChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, incidentCategory: value }))
                    }
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Severity</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={incidentForm.severity}
                      onChange={(event) =>
                        setIncidentForm((prev) => ({ ...prev, severity: event.target.value }))
                      }
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                    <textarea
                      className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={incidentForm.description}
                      onChange={(event) => setIncidentForm((prev) => ({ ...prev, description: event.target.value }))}
                    />
                  </div>
                  <FormInput
                    label="Witnesses"
                    value={incidentForm.witnesses}
                    onChange={(value) => setIncidentForm((prev) => ({ ...prev, witnesses: value }))}
                  />
                  <FormInput
                    label="Action Taken"
                    value={incidentForm.actionTaken}
                    onChange={(value) => setIncidentForm((prev) => ({ ...prev, actionTaken: value }))}
                  />
                  <FormInput
                    label="Attachment URLs (comma separated)"
                    value={incidentForm.attachmentUrls}
                    onChange={(value) =>
                      setIncidentForm((prev) => ({ ...prev, attachmentUrls: value }))
                    }
                  />
                  <div className="md:col-span-3 grid gap-2 md:grid-cols-3 rounded-md border border-slate-200 p-2">
                    <CheckboxField
                      label="Follow-up Required"
                      checked={incidentForm.followUpRequired}
                      onChange={(checked) =>
                        setIncidentForm((prev) => ({ ...prev, followUpRequired: checked }))
                      }
                    />
                    <CheckboxField
                      label="Resolved"
                      checked={incidentForm.resolved}
                      onChange={(checked) => setIncidentForm((prev) => ({ ...prev, resolved: checked }))}
                    />
                    <CheckboxField
                      label="Internal Only"
                      checked={incidentForm.internalOnly}
                      onChange={(checked) =>
                        setIncidentForm((prev) => ({ ...prev, internalOnly: checked }))
                      }
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Follow-up Notes</label>
                    <textarea
                      className="min-h-16 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={incidentForm.followUpNotes}
                      onChange={(event) =>
                        setIncidentForm((prev) => ({ ...prev, followUpNotes: event.target.value }))
                      }
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <Button type="button" onClick={() => void saveIncident()}>
                    Save Incident
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Concern History</p>
                  <TableView
                    headers={["Volunteer", "Category", "Type", "Severity", "Action", "Status", "Date"]}
                    rows={concerns.map((entry) => {
                      const volunteer = volunteers.find(
                        (item) => String(item.id) === String(entry.volunteer_profile_id)
                      );
                      const contact = volunteer
                        ? ((Array.isArray(volunteer.contacts)
                            ? volunteer.contacts[0]
                            : volunteer.contacts) as Record<string, unknown> | null)
                        : null;
                      return [
                        displayContactName(contact),
                        toText(entry.concern_category),
                        toText(entry.concern_type),
                        toText(entry.severity),
                        toText(entry.action_level),
                        toText(entry.review_status),
                        toText(entry.concern_date)
                      ];
                    })}
                  />
                </div>
                <div className="rounded-md border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-900">Incident Log</p>
                  <TableView
                    headers={["When", "Category", "Severity", "Resolved", "Event", "Role", "Description"]}
                    rows={incidents.map((entry) => [
                      toText(entry.incident_at),
                      toText(entry.incident_category),
                      toText(entry.severity),
                      Boolean(entry.resolved) ? "Yes" : "No",
                      toText(
                        (Array.isArray(entry.volunteer_events)
                          ? entry.volunteer_events[0]
                          : entry.volunteer_events as Record<string, unknown> | null)?.event_name
                      ),
                      toText(
                        (Array.isArray(entry.volunteer_event_roles)
                          ? entry.volunteer_event_roles[0]
                          : entry.volunteer_event_roles as Record<string, unknown> | null)?.role_name
                      ),
                      toText(entry.description)
                    ])}
                  />
                </div>
              </div>
              <div className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-900">Burnout Flag History</p>
                <TableView
                  headers={["Volunteer", "Type", "Status", "Pause Until", "Reason", "Created At"]}
                  rows={burnoutFlags.map((entry) => {
                    const volunteer = volunteers.find(
                      (item) => String(item.id) === String(entry.volunteer_profile_id)
                    );
                    const contact = volunteer
                      ? ((Array.isArray(volunteer.contacts)
                          ? volunteer.contacts[0]
                          : volunteer.contacts) as Record<string, unknown> | null)
                      : null;
                    return [
                      displayContactName(contact),
                      toText(entry.flag_type),
                      toText(entry.status),
                      toText(entry.pause_until),
                      toText(entry.reason),
                      toText(entry.created_at)
                    ];
                  })}
                />
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "reports" ? (
        <section className="space-y-3">
          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Volunteer Coordination Reports</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Total Active Volunteers" value={toText(summary.activeVolunteers) || "0"} />
              <StatCard label="Total Events" value={toText(summary.totalEvents) || "0"} />
              <StatCard label="Open Roles" value={toText(summary.openRoles) || "0"} />
              <StatCard label="No-Shows" value={toText(summary.noShowCount) || "0"} />
              <StatCard label="Incidents" value={toText(summary.incidentsCount) || "0"} />
              <StatCard label="Concerns" value={toText(summary.concernsCount) || "0"} />
              <StatCard label="Waitlist" value={toText(summary.waitlistCount) || "0"} />
              <StatCard label="Substitute Pool" value={toText(summary.substituteCount) || "0"} />
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Monthly Volunteer Hours</p>
              <TableView
                headers={["Month", "Hours"]}
                rows={((reports.monthlyHours as Array<Record<string, unknown>> | undefined) ?? []).map((row) => [
                  toText(row.month),
                  toText(row.hours)
                ])}
              />
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">No-Show Tracking</p>
              <TableView
                headers={["Volunteer Profile", "Event", "Role", "Assigned At", "Reason"]}
                rows={((reports.noShowAssignments as Array<Record<string, unknown>> | undefined) ?? []).map(
                  (row) => [
                    toText(row.volunteer_profile_id),
                    toText(
                      (Array.isArray(row.volunteer_events)
                        ? row.volunteer_events[0]
                        : row.volunteer_events as Record<string, unknown> | null)?.event_name
                    ),
                    toText(
                      (Array.isArray(row.volunteer_event_roles)
                        ? row.volunteer_event_roles[0]
                        : row.volunteer_event_roles as Record<string, unknown> | null)?.role_name
                    ),
                    toText(row.assigned_at),
                    toText(row.no_show_reason)
                  ]
                )}
              />
            </div>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Recruiting Candidate List (Tag/Skill Ready)</p>
            <p className="mb-2 text-xs text-slate-600">
              Use Volunteers & Recruiting filters to narrow candidates by tags, skills, compliance, status,
              reliability, and safety indicators. This module stores structured records for future
              communication/calendar integration without enabling those channels yet.
            </p>
            <TableView
              headers={[
                "Volunteer",
                "Status",
                "Type",
                "Skills",
                "Certifications",
                "Reliability",
                "Burnout",
                "Caution"
              ]}
              rows={volunteers.map((volunteer) => {
                const contact = (Array.isArray(volunteer.contacts)
                  ? volunteer.contacts[0]
                  : volunteer.contacts) as Record<string, unknown> | null;
                const skillList = Array.isArray(volunteer.skills)
                  ? volunteer.skills.map((entry) => toText(entry)).join(", ")
                  : "";
                const certList = Array.isArray(volunteer.certifications)
                  ? volunteer.certifications.map((entry) => toText(entry)).join(", ")
                  : "";
                return [
                  displayContactName(contact),
                  toText(volunteer.volunteer_status),
                  toText(volunteer.volunteer_type),
                  skillList || "-",
                  certList || "-",
                  `${toText(volunteer.reliability_indicator)} (${toText(volunteer.reliability_score)})`,
                  Boolean(volunteer.burnout_flag) ? "Yes" : "No",
                  Boolean(volunteer.caution_flag) || Boolean(volunteer.soft_blacklist_flag) ? "Yes" : "No"
                ];
              })}
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}

function displayContactName(contact: Record<string, unknown> | null) {
  if (!contact) return "-";
  const orgName = toText(contact.organization_name);
  if (orgName) return orgName;
  const firstName = toText(contact.first_name);
  const lastName = toText(contact.last_name);
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || toText(contact.id) || "-";
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs font-medium text-slate-600">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  type = "text",
  multiline = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {multiline ? (
        <textarea
          className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
    </div>
  );
}

function CheckboxField({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <select
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  headers,
  onChange
}: {
  label: string;
  value: string;
  headers: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <select
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">-- Select column --</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </div>
  );
}

function TableView({
  headers,
  rows
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="max-h-80 overflow-auto rounded-md border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50">
            {headers.map((header) => (
              <th key={header} className="py-2 px-2 font-semibold text-slate-700">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row, index) => (
              <tr key={`${index}-${row.join("|")}`} className="border-b border-slate-100 align-top">
                {row.map((cell, cellIndex) => (
                  <td key={`${index}-${cellIndex}`} className="px-2 py-2 text-slate-700">
                    {cell || "-"}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-2 py-3 text-slate-500" colSpan={headers.length}>
                No records found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
