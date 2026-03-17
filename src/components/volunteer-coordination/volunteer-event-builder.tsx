"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type BuilderStep = 1 | 2 | 3 | 4 | 5 | 6;
type CallStatus =
  | "not_called"
  | "called"
  | "left_message"
  | "spoke_to"
  | "confirmed"
  | "declined"
  | "no_answer"
  | "follow_up_needed";

const STEP_LABELS: Array<{ id: BuilderStep; label: string }> = [
  { id: 1, label: "Step 1: Create the Event" },
  { id: 2, label: "Step 2: Recurrence" },
  { id: 3, label: "Step 3: Roles" },
  { id: 4, label: "Step 4: Shifts" },
  { id: 5, label: "Step 5: Staff Shifts" },
  { id: 6, label: "Step 6: Waitlists & Substitutes" }
];

const DRAFT_STORAGE_KEY = "volunteer-event-builder-draft-v1";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value: unknown) {
  return toText(value).toLowerCase();
}

function splitCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinCsv(values: unknown) {
  if (!Array.isArray(values)) return "";
  return values.map((entry) => toText(entry)).filter(Boolean).join(", ");
}

function displayContactName(contact: Record<string, unknown> | null | undefined) {
  if (!contact) return "Unknown";
  const organization = toText(contact.organization_name);
  if (organization) return organization;
  const preferred = toText(contact.preferred_name);
  const first = toText(contact.first_name);
  const last = toText(contact.last_name);
  return preferred || `${first} ${last}`.trim() || "Unnamed contact";
}

function toHourValue(timeValue: string) {
  const [hourText, minuteText] = timeValue.split(":");
  const hours = Number(hourText);
  const minutes = Number(minuteText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours + minutes / 60;
}

function calculateHoursBetween(startTime: string, endTime: string) {
  const start = toHourValue(startTime);
  const end = toHourValue(endTime);
  return Math.max(0, Math.round((end - start) * 100) / 100);
}

function overlapShifts(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  const startA = toHourValue(aStart);
  const endA = toHourValue(aEnd);
  const startB = toHourValue(bStart);
  const endB = toHourValue(bEnd);
  return startA < endB && startB < endA;
}

async function postJson(endpoint: string, payload: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || body.ok === false) {
    throw new Error(toText(body.message) || `Request failed for ${endpoint}`);
  }
  return (body.result as Record<string, unknown> | undefined) ?? (body as Record<string, unknown>);
}

type CandidateRecommendation = {
  volunteerId: string;
  volunteerName: string;
  email: string;
  phone: string;
  score: number;
  reasons: string[];
  warnings: string[];
  eligible: boolean;
  isAssignedToThisShift: boolean;
  hasScheduleConflict: boolean;
};

export function VolunteerEventBuilder() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<BuilderStep>(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [schemaWarning, setSchemaWarning] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [currentEventId, setCurrentEventId] = useState("");

  const [eventForm, setEventForm] = useState({
    id: "",
    eventName: "",
    eventType: "",
    programDepartment: "",
    eventStatus: "draft",
    eventDate: "",
    startTime: "",
    endTime: "",
    location: "",
    coordinatorUserId: "",
    eventDescription: "",
    familyFriendly: false,
    groupAllowed: false,
    minorAllowed: false,
    mealOffered: false,
    tshirtOffered: false,
    mealOptions: "",
    tshirtOptions: "",
    notes: ""
  });

  const [recurrenceForm, setRecurrenceForm] = useState({
    isRecurring: false,
    seriesName: "",
    recurrencePattern: "weekly",
    recurrenceInterval: "1",
    recurrenceDaysOfWeek: "1",
    recurrenceDayOfMonth: "",
    startsOn: "",
    endsOn: "",
    endsAfterOccurrences: "",
    timezone: "UTC",
    notes: "",
    seriesId: ""
  });

  const [roleForm, setRoleForm] = useState({
    id: "",
    parentRoleId: "",
    roleName: "",
    roleDescription: "",
    isLeadRole: false,
    requiredSkills: "",
    requiredTags: "",
    requiredCertifications: "",
    requiredTraining: "",
    minorAllowed: true,
    groupParticipantAllowed: true,
    familyMemberAllowed: true,
    driverEligibilityRequired: false,
    backgroundCheckRequired: false,
    physicalRequirements: "",
    notes: "",
    waitlistEnabled: true,
    substituteEnabled: true
  });

  const [shiftForm, setShiftForm] = useState({
    id: "",
    roleId: "",
    shiftName: "",
    shiftStart: "",
    shiftEnd: "",
    numberNeeded: "1",
    supervisorContactId: "",
    checkInLocation: "",
    notes: "",
    waitlistEnabled: true,
    substituteEnabled: true,
    maxWaitlistCount: "",
    maxSubstituteCount: "",
    substituteScope: "shift" as "shift" | "role"
  });

  const [selectedShiftId, setSelectedShiftId] = useState("");
  const [staffFilter, setStaffFilter] = useState({
    search: "",
    tags: "",
    skills: "",
    includeBurnout: false,
    includeCaution: false,
    includeDoNotSchedule: false,
    requireCompliant: false
  });

  const [callTracking, setCallTracking] = useState<Record<string, { status: CallStatus; notes: string }>>({});

  const [fallbackScope, setFallbackScope] = useState<"role" | "shift">("role");
  const [fallbackRoleId, setFallbackRoleId] = useState("");
  const [fallbackShiftId, setFallbackShiftId] = useState("");
  const [fallbackSettings, setFallbackSettings] = useState({
    waitlistEnabled: true,
    substituteEnabled: true,
    maxWaitlistCount: "",
    maxSubstituteCount: "",
    substituteScope: "shift" as "shift" | "role"
  });

  const [waitlistForm, setWaitlistForm] = useState({
    volunteerProfileId: "",
    waitlistOrder: "1",
    entryStatus: "waiting",
    notes: ""
  });
  const [substituteForm, setSubstituteForm] = useState({
    volunteerProfileId: "",
    availabilityStatus: "available",
    priorityOrder: "1",
    notes: ""
  });
  const requestedEventId = toText(searchParams.get("eventId"));

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!currentEventId) return;
    const draft = {
      step,
      currentEventId,
      eventForm,
      recurrenceForm,
      roleForm,
      shiftForm,
      fallbackScope,
      fallbackRoleId,
      fallbackShiftId
    };
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [
    step,
    currentEventId,
    eventForm,
    recurrenceForm,
    roleForm,
    shiftForm,
    fallbackScope,
    fallbackRoleId,
    fallbackShiftId
  ]);

  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (toText(parsed.currentEventId)) setCurrentEventId(toText(parsed.currentEventId));
      if (typeof parsed.step === "number" && parsed.step >= 1 && parsed.step <= 6) {
        setStep(parsed.step as BuilderStep);
      }
      if (parsed.eventForm && typeof parsed.eventForm === "object") {
        setEventForm((prev) => ({ ...prev, ...(parsed.eventForm as typeof prev) }));
      }
      if (parsed.recurrenceForm && typeof parsed.recurrenceForm === "object") {
        setRecurrenceForm((prev) => ({ ...prev, ...(parsed.recurrenceForm as typeof prev) }));
      }
      if (parsed.roleForm && typeof parsed.roleForm === "object") {
        setRoleForm((prev) => ({ ...prev, ...(parsed.roleForm as typeof prev) }));
      }
      if (parsed.shiftForm && typeof parsed.shiftForm === "object") {
        setShiftForm((prev) => ({ ...prev, ...(parsed.shiftForm as typeof prev) }));
      }
      if (parsed.fallbackScope === "role" || parsed.fallbackScope === "shift") {
        setFallbackScope(parsed.fallbackScope);
      }
      if (toText(parsed.fallbackRoleId)) setFallbackRoleId(toText(parsed.fallbackRoleId));
      if (toText(parsed.fallbackShiftId)) setFallbackShiftId(toText(parsed.fallbackShiftId));
    } catch {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    }
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/volunteer-coordination/overview", {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      const payload = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(toText(payload.message) || "Unable to load event builder data.");
      setData(payload);
      setSchemaWarning(toText(payload.schemaWarning) || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load event builder data.");
    } finally {
      setLoading(false);
    }
  }

  const events = useMemo(
    () => ((data?.events as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const eventSeries = useMemo(
    () => ((data?.eventSeries as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const eventRoles = useMemo(
    () => ((data?.eventRoles as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const roleShifts = useMemo(
    () => ((data?.roleShifts as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const assignments = useMemo(
    () => ((data?.assignments as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const waitlistEntries = useMemo(
    () => ((data?.waitlist as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const substituteEntries = useMemo(
    () => ((data?.substitutes as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const volunteers = useMemo(
    () => ((data?.volunteers as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );
  const complianceItems = useMemo(
    () => ((data?.complianceItems as Array<Record<string, unknown>> | undefined) ?? []).slice(),
    [data]
  );

  const currentEvent = useMemo(
    () => events.find((event) => toText(event.id) === currentEventId) ?? null,
    [events, currentEventId]
  );

  useEffect(() => {
    if (!requestedEventId) return;
    if (requestedEventId === currentEventId) return;
    const existing = events.find((event) => toText(event.id) === requestedEventId);
    if (!existing) return;
    setFormFromEvent(existing);
    setStep(1);
  }, [requestedEventId, events, currentEventId]);

  const currentRoles = useMemo(
    () => eventRoles.filter((role) => toText(role.event_id) === currentEventId),
    [eventRoles, currentEventId]
  );

  const currentShifts = useMemo(
    () => roleShifts.filter((shift) => toText(shift.event_id) === currentEventId),
    [roleShifts, currentEventId]
  );

  const currentAssignments = useMemo(
    () => assignments.filter((assignment) => toText(assignment.event_id) === currentEventId),
    [assignments, currentEventId]
  );

  const currentWaitlistEntries = useMemo(
    () => waitlistEntries.filter((entry) => toText(entry.event_id) === currentEventId),
    [waitlistEntries, currentEventId]
  );

  const currentSubstituteEntries = useMemo(
    () => substituteEntries.filter((entry) => toText(entry.event_id) === currentEventId),
    [substituteEntries, currentEventId]
  );

  useEffect(() => {
    if (!selectedShiftId && currentShifts.length > 0) {
      setSelectedShiftId(toText(currentShifts[0].id));
    }
  }, [currentShifts, selectedShiftId]);

  const volunteerById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const volunteer of volunteers) {
      map.set(toText(volunteer.id), volunteer);
    }
    return map;
  }, [volunteers]);

  const roleById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const role of currentRoles) {
      map.set(toText(role.id), role);
    }
    return map;
  }, [currentRoles]);

  const shiftById = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    for (const shift of currentShifts) {
      map.set(toText(shift.id), shift);
    }
    return map;
  }, [currentShifts]);

  const callStatusOptions: Array<{ value: CallStatus; label: string }> = [
    { value: "not_called", label: "Not Called" },
    { value: "called", label: "Called" },
    { value: "left_message", label: "Left Message" },
    { value: "spoke_to", label: "Spoke To" },
    { value: "confirmed", label: "Confirmed" },
    { value: "declined", label: "Declined" },
    { value: "no_answer", label: "No Answer" },
    { value: "follow_up_needed", label: "Follow Up Needed" }
  ];

  function clearTransientMessages() {
    setError(null);
    setMessage(null);
  }

  function setFormFromEvent(event: Record<string, unknown>) {
    const hasMeal = Array.isArray(event.meal_options) && event.meal_options.length > 0;
    const hasShirt = Array.isArray(event.tshirt_options) && event.tshirt_options.length > 0;
    const nextEventId = toText(event.id);
    const nextSeriesId = toText(event.series_id);
    setCurrentEventId(nextEventId);
    setEventForm({
      id: nextEventId,
      eventName: toText(event.event_name),
      eventType: toText(event.event_type),
      programDepartment: toText(event.program_department),
      eventStatus: toText(event.event_status) || "draft",
      eventDate: toText(event.event_date),
      startTime: toText(event.start_time),
      endTime: toText(event.end_time),
      location: toText(event.location),
      coordinatorUserId: toText(event.coordinator_user_id),
      eventDescription: toText(event.event_description),
      familyFriendly: Boolean(event.family_friendly),
      groupAllowed: Boolean(event.group_allowed),
      minorAllowed: Boolean(event.minor_allowed),
      mealOffered: hasMeal,
      tshirtOffered: hasShirt,
      mealOptions: joinCsv(event.meal_options),
      tshirtOptions: joinCsv(event.tshirt_options),
      notes: toText(event.notes)
    });
    if (nextSeriesId) {
      const series = eventSeries.find((row) => toText(row.id) === nextSeriesId);
      setRecurrenceForm((prev) => ({
        ...prev,
        isRecurring: true,
        seriesId: nextSeriesId,
        seriesName: toText(series?.series_name) || prev.seriesName,
        recurrencePattern: toText(series?.recurrence_pattern) || prev.recurrencePattern,
        recurrenceInterval: toText(series?.recurrence_interval) || prev.recurrenceInterval,
        recurrenceDaysOfWeek: Array.isArray(series?.recurrence_days_of_week)
          ? (series?.recurrence_days_of_week as Array<unknown>).map((entry) => toText(entry)).join(",")
          : prev.recurrenceDaysOfWeek,
        recurrenceDayOfMonth: toText(series?.recurrence_day_of_month),
        startsOn: toText(series?.starts_on),
        endsOn: toText(series?.ends_on),
        endsAfterOccurrences: toText(series?.ends_after_occurrences),
        timezone: toText(series?.timezone) || prev.timezone,
        notes: toText(series?.notes)
      }));
    } else {
      setRecurrenceForm((prev) => ({ ...prev, isRecurring: false, seriesId: "" }));
    }
    clearTransientMessages();
  }

  async function saveEventStep() {
    if (!toText(eventForm.eventName) || !toText(eventForm.eventDate) || !toText(eventForm.startTime) || !toText(eventForm.endTime)) {
      throw new Error("Event Name, Event Date, Start Time, and End Time are required.");
    }
    const result = await postJson("/api/volunteer-coordination/events", {
      id: toText(eventForm.id) || undefined,
      eventName: eventForm.eventName,
      eventType: eventForm.eventType || null,
      programDepartment: eventForm.programDepartment || null,
      eventStatus: eventForm.eventStatus || "draft",
      eventDate: eventForm.eventDate,
      startTime: eventForm.startTime,
      endTime: eventForm.endTime,
      location: eventForm.location || null,
      coordinatorUserId: eventForm.coordinatorUserId || null,
      eventDescription: eventForm.eventDescription || null,
      familyFriendly: eventForm.familyFriendly,
      groupAllowed: eventForm.groupAllowed,
      minorAllowed: eventForm.minorAllowed,
      mealOptions: eventForm.mealOffered ? splitCsv(eventForm.mealOptions || "Meal Offered") : [],
      tshirtOptions: eventForm.tshirtOffered ? splitCsv(eventForm.tshirtOptions || "T-Shirt Offered") : [],
      notes: eventForm.notes || null,
      seriesId: recurrenceForm.seriesId || null
    });
    const savedId = toText(result.id);
    setEventForm((prev) => ({ ...prev, id: savedId }));
    setCurrentEventId(savedId);
    setMessage("Step 1 saved: event details captured.");
    await loadData();
    return savedId;
  }

  async function saveRecurrenceStep() {
    const eventId = currentEventId || (await saveEventStep());
    if (!recurrenceForm.isRecurring) {
      setRecurrenceForm((prev) => ({ ...prev, seriesId: "" }));
      await postJson("/api/volunteer-coordination/events", {
        id: eventId,
        eventName: eventForm.eventName,
        eventType: eventForm.eventType || null,
        programDepartment: eventForm.programDepartment || null,
        eventStatus: eventForm.eventStatus || "draft",
        eventDate: eventForm.eventDate,
        startTime: eventForm.startTime,
        endTime: eventForm.endTime,
        location: eventForm.location || null,
        coordinatorUserId: eventForm.coordinatorUserId || null,
        eventDescription: eventForm.eventDescription || null,
        familyFriendly: eventForm.familyFriendly,
        groupAllowed: eventForm.groupAllowed,
        minorAllowed: eventForm.minorAllowed,
        mealOptions: eventForm.mealOffered ? splitCsv(eventForm.mealOptions || "Meal Offered") : [],
        tshirtOptions: eventForm.tshirtOffered ? splitCsv(eventForm.tshirtOptions || "T-Shirt Offered") : [],
        notes: eventForm.notes || null,
        seriesId: null
      });
      setMessage("Step 2 saved: event is configured as one-time.");
      await loadData();
      return;
    }

    let seriesId = recurrenceForm.seriesId;
    if (!seriesId) {
      if (!recurrenceForm.seriesName) throw new Error("Series Name is required for recurring events.");
      const series = await postJson("/api/volunteer-coordination/event-series", {
        seriesName: recurrenceForm.seriesName,
        recurrencePattern: recurrenceForm.recurrencePattern,
        recurrenceInterval: toNumber(recurrenceForm.recurrenceInterval, 1),
        recurrenceDaysOfWeek: splitCsv(recurrenceForm.recurrenceDaysOfWeek).map((entry) => toNumber(entry)),
        recurrenceDayOfMonth: recurrenceForm.recurrenceDayOfMonth
          ? toNumber(recurrenceForm.recurrenceDayOfMonth)
          : null,
        startsOn: recurrenceForm.startsOn || eventForm.eventDate,
        endsOn: recurrenceForm.endsOn || null,
        endsAfterOccurrences: recurrenceForm.endsAfterOccurrences
          ? toNumber(recurrenceForm.endsAfterOccurrences)
          : null,
        timezone: recurrenceForm.timezone || "UTC",
        notes: recurrenceForm.notes || null
      });
      seriesId = toText(series.id);
      setRecurrenceForm((prev) => ({ ...prev, seriesId }));
    }

    await postJson("/api/volunteer-coordination/events", {
      id: eventId,
      eventName: eventForm.eventName,
      eventType: eventForm.eventType || null,
      programDepartment: eventForm.programDepartment || null,
      eventStatus: eventForm.eventStatus || "draft",
      eventDate: eventForm.eventDate,
      startTime: eventForm.startTime,
      endTime: eventForm.endTime,
      location: eventForm.location || null,
      coordinatorUserId: eventForm.coordinatorUserId || null,
      eventDescription: eventForm.eventDescription || null,
      familyFriendly: eventForm.familyFriendly,
      groupAllowed: eventForm.groupAllowed,
      minorAllowed: eventForm.minorAllowed,
      mealOptions: eventForm.mealOffered ? splitCsv(eventForm.mealOptions || "Meal Offered") : [],
      tshirtOptions: eventForm.tshirtOffered ? splitCsv(eventForm.tshirtOptions || "T-Shirt Offered") : [],
      notes: eventForm.notes || null,
      seriesId
    });
    setMessage("Step 2 saved: recurrence settings linked to this event.");
    await loadData();
  }

  async function saveRoleStep() {
    if (!currentEventId) throw new Error("Save Step 1 first to create the event.");
    if (!toText(roleForm.roleName)) throw new Error("Role Name is required.");
    await postJson("/api/volunteer-coordination/roles", {
      id: roleForm.id || undefined,
      eventId: currentEventId,
      parentRoleId: roleForm.parentRoleId || null,
      roleName: roleForm.roleName,
      roleDescription: roleForm.roleDescription || null,
      numberNeeded: 1,
      waitlistEnabled: roleForm.waitlistEnabled,
      substituteEnabled: roleForm.substituteEnabled,
      isLeadRole: roleForm.isLeadRole,
      requiredSkills: splitCsv(roleForm.requiredSkills),
      requiredTags: splitCsv(roleForm.requiredTags),
      requiredCertifications: splitCsv(roleForm.requiredCertifications),
      requiredTraining: splitCsv(roleForm.requiredTraining),
      backgroundCheckRequired: roleForm.backgroundCheckRequired,
      driverEligibilityRequired: roleForm.driverEligibilityRequired,
      minorAllowed: roleForm.minorAllowed,
      familyMemberAllowed: roleForm.familyMemberAllowed,
      groupParticipantAllowed: roleForm.groupParticipantAllowed,
      physicalRequirements: roleForm.physicalRequirements || null,
      notes: roleForm.notes || null
    });
    setRoleForm({
      id: "",
      parentRoleId: "",
      roleName: "",
      roleDescription: "",
      isLeadRole: false,
      requiredSkills: "",
      requiredTags: "",
      requiredCertifications: "",
      requiredTraining: "",
      minorAllowed: true,
      groupParticipantAllowed: true,
      familyMemberAllowed: true,
      driverEligibilityRequired: false,
      backgroundCheckRequired: false,
      physicalRequirements: "",
      notes: "",
      waitlistEnabled: true,
      substituteEnabled: true
    });
    setMessage("Step 3 saved: role template added.");
    await loadData();
  }

  async function saveShiftStep() {
    if (!currentEventId) throw new Error("Save Step 1 first to create the event.");
    if (!toText(shiftForm.roleId)) throw new Error("Select the role for this shift.");
    if (!toText(shiftForm.shiftStart) || !toText(shiftForm.shiftEnd)) {
      throw new Error("Shift start and end times are required.");
    }
    await postJson("/api/volunteer-coordination/shifts", {
      id: shiftForm.id || undefined,
      eventId: currentEventId,
      roleId: shiftForm.roleId,
      shiftName: shiftForm.shiftName || null,
      shiftStart: shiftForm.shiftStart,
      shiftEnd: shiftForm.shiftEnd,
      numberNeeded: toNumber(shiftForm.numberNeeded, 1),
      supervisorContactId: shiftForm.supervisorContactId || null,
      checkInLocation: shiftForm.checkInLocation || null,
      notes: shiftForm.notes || null,
      waitlistEnabled: shiftForm.waitlistEnabled,
      substituteEnabled: shiftForm.substituteEnabled,
      maxWaitlistCount: shiftForm.maxWaitlistCount ? toNumber(shiftForm.maxWaitlistCount) : null,
      maxSubstituteCount: shiftForm.maxSubstituteCount ? toNumber(shiftForm.maxSubstituteCount) : null,
      substituteScope: shiftForm.substituteScope
    });
    setShiftForm((prev) => ({
      ...prev,
      id: "",
      shiftName: "",
      shiftStart: "",
      shiftEnd: "",
      numberNeeded: "1",
      supervisorContactId: "",
      checkInLocation: "",
      notes: "",
      maxWaitlistCount: "",
      maxSubstituteCount: ""
    }));
    setMessage("Step 4 saved: shift added to role.");
    await loadData();
  }

  async function assignVolunteerToShift(volunteerProfileId: string, shiftId: string) {
    if (!currentEventId) throw new Error("Select or create an event first.");
    const shift = shiftById.get(shiftId);
    if (!shift) throw new Error("Shift could not be found.");
    const scheduledHours = calculateHoursBetween(toText(shift.shift_start), toText(shift.shift_end));
    await postJson("/api/volunteer-coordination/assignments", {
      volunteerProfileId,
      eventId: currentEventId,
      roleId: toText(shift.role_id) || null,
      shiftId,
      assignmentStatus: "confirmed",
      approvalStatus: "approved",
      scheduledHours,
      notes: "Assigned from Event Builder staffing step"
    });
    setMessage("Volunteer assigned to shift.");
    await loadData();
  }

  async function saveFallbackConfiguration() {
    if (!currentEventId) throw new Error("Select or create an event first.");
    if (!fallbackRoleId) throw new Error("Select a role for fallback settings.");
    if (fallbackScope === "role") {
      const role = roleById.get(fallbackRoleId);
      if (!role) throw new Error("Role not found.");
      await postJson("/api/volunteer-coordination/roles", {
        id: toText(role.id),
        eventId: currentEventId,
        parentRoleId: toText(role.parent_role_id) || null,
        roleName: toText(role.role_name),
        roleDescription: toText(role.role_description) || null,
        numberNeeded: Math.max(1, toNumber(role.number_needed, 1)),
        waitlistEnabled: fallbackSettings.waitlistEnabled,
        substituteEnabled: fallbackSettings.substituteEnabled,
        isLeadRole: Boolean(role.is_lead_role),
        requiredSkills: Array.isArray(role.required_skills) ? role.required_skills : [],
        requiredTags: Array.isArray(role.required_tags) ? role.required_tags : [],
        requiredCertifications: Array.isArray(role.required_certifications) ? role.required_certifications : [],
        requiredTraining: Array.isArray(role.required_training) ? role.required_training : [],
        backgroundCheckRequired: Boolean(role.background_check_required),
        driverEligibilityRequired: Boolean(role.driver_eligibility_required),
        minorAllowed: Boolean(role.minor_allowed),
        familyMemberAllowed: Boolean(role.family_member_allowed),
        groupParticipantAllowed: Boolean(role.group_participant_allowed),
        physicalRequirements: toText(role.physical_requirements) || null,
        checkInLocation: toText(role.check_in_location) || null,
        notes: toText(role.notes) || null
      });
    } else {
      if (!fallbackShiftId) throw new Error("Select a shift for shift-level fallback settings.");
      const shift = shiftById.get(fallbackShiftId);
      if (!shift) throw new Error("Shift not found.");
      await postJson("/api/volunteer-coordination/shifts", {
        id: toText(shift.id),
        eventId: currentEventId,
        roleId: toText(shift.role_id),
        shiftName: toText(shift.shift_name) || null,
        shiftStart: toText(shift.shift_start),
        shiftEnd: toText(shift.shift_end),
        numberNeeded: Math.max(1, toNumber(shift.number_needed, 1)),
        supervisorContactId: toText(shift.supervisor_contact_id) || null,
        checkInLocation: toText(shift.check_in_location) || null,
        notes: toText(shift.notes) || null,
        waitlistEnabled: fallbackSettings.waitlistEnabled,
        substituteEnabled: fallbackSettings.substituteEnabled,
        maxWaitlistCount: fallbackSettings.maxWaitlistCount
          ? toNumber(fallbackSettings.maxWaitlistCount)
          : null,
        maxSubstituteCount: fallbackSettings.maxSubstituteCount
          ? toNumber(fallbackSettings.maxSubstituteCount)
          : null,
        substituteScope: fallbackSettings.substituteScope
      });
    }
    setMessage("Step 6 saved: fallback configuration updated.");
    await loadData();
  }

  async function saveWaitlistEntry() {
    if (!currentEventId || !fallbackRoleId || !waitlistForm.volunteerProfileId) {
      throw new Error("Select event/role/volunteer to add a waitlist entry.");
    }
    await postJson("/api/volunteer-coordination/waitlist", {
      eventId: currentEventId,
      roleId: fallbackRoleId,
      shiftId: fallbackScope === "shift" ? fallbackShiftId || null : null,
      volunteerProfileId: waitlistForm.volunteerProfileId,
      waitlistOrder: toNumber(waitlistForm.waitlistOrder, 1),
      entryStatus: waitlistForm.entryStatus,
      notes: waitlistForm.notes || null
    });
    setMessage("Waitlist entry saved.");
    await loadData();
  }

  async function saveSubstituteEntry() {
    if (!currentEventId || !substituteForm.volunteerProfileId) {
      throw new Error("Select event and volunteer for substitute entry.");
    }
    await postJson("/api/volunteer-coordination/substitutes", {
      eventId: currentEventId,
      roleId: fallbackRoleId || null,
      shiftId: fallbackScope === "shift" ? fallbackShiftId || null : null,
      volunteerProfileId: substituteForm.volunteerProfileId,
      availabilityStatus: substituteForm.availabilityStatus,
      priorityOrder: toNumber(substituteForm.priorityOrder, 1),
      notes: substituteForm.notes || null
    });
    setMessage("Substitute entry saved.");
    await loadData();
  }

  async function runStepAction(action: () => Promise<unknown>) {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    let ok = true;
    try {
      await action();
    } catch (actionError) {
      ok = false;
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setSubmitting(false);
    }
    return ok;
  }

  async function commitEventAfterStep4() {
    if (!currentEventId) throw new Error("Save Step 1 first to create the event.");
    if (currentShifts.length === 0) {
      throw new Error("Add at least one shift in Step 4 before moving to staffing.");
    }
    const nextStatus = normalizeText(eventForm.eventStatus) === "draft" ? "recruiting" : eventForm.eventStatus;
    await postJson("/api/volunteer-coordination/events", {
      id: currentEventId,
      eventName: eventForm.eventName,
      eventType: eventForm.eventType || null,
      programDepartment: eventForm.programDepartment || null,
      eventStatus: nextStatus || "recruiting",
      eventDate: eventForm.eventDate,
      startTime: eventForm.startTime,
      endTime: eventForm.endTime,
      location: eventForm.location || null,
      coordinatorUserId: eventForm.coordinatorUserId || null,
      eventDescription: eventForm.eventDescription || null,
      familyFriendly: eventForm.familyFriendly,
      groupAllowed: eventForm.groupAllowed,
      minorAllowed: eventForm.minorAllowed,
      mealOptions: eventForm.mealOffered ? splitCsv(eventForm.mealOptions || "Meal Offered") : [],
      tshirtOptions: eventForm.tshirtOffered ? splitCsv(eventForm.tshirtOptions || "T-Shirt Offered") : [],
      notes: eventForm.notes || null,
      seriesId: recurrenceForm.seriesId || null
    });
    setEventForm((prev) => ({ ...prev, eventStatus: nextStatus || "recruiting" }));
    setMessage("Step 4 complete. Event is committed and ready for staffing (Steps 5 and 6).");
    await loadData();
  }

  const staffingContext = useMemo(() => {
    const selectedShift = shiftById.get(selectedShiftId) ?? null;
    const selectedRole = selectedShift ? roleById.get(toText(selectedShift.role_id)) ?? null : null;
    const requestedTags = splitCsv(staffFilter.tags).map((entry) => entry.toLowerCase());
    const requestedSkills = splitCsv(staffFilter.skills).map((entry) => entry.toLowerCase());
    const roleRequiredTags = Array.isArray(selectedRole?.required_tags)
      ? (selectedRole?.required_tags as Array<unknown>).map((entry) => normalizeText(entry))
      : [];
    const roleRequiredSkills = Array.isArray(selectedRole?.required_skills)
      ? (selectedRole?.required_skills as Array<unknown>).map((entry) => normalizeText(entry))
      : [];
    const roleRequiredCerts = Array.isArray(selectedRole?.required_certifications)
      ? (selectedRole?.required_certifications as Array<unknown>).map((entry) => normalizeText(entry))
      : [];
    const roleRequiresBackground = Boolean(selectedRole?.background_check_required);
    const roleRequiresDriver = Boolean(selectedRole?.driver_eligibility_required);
    const roleAllowsMinor = selectedRole ? Boolean(selectedRole.minor_allowed) : true;
    const roleAllowsGroup = selectedRole ? Boolean(selectedRole.group_participant_allowed) : true;
    const roleAllowsFamily = selectedRole ? Boolean(selectedRole.family_member_allowed) : true;

    const recommendations = volunteers
      .map((volunteer) => {
        const volunteerId = toText(volunteer.id);
        const contact = (Array.isArray(volunteer.contacts)
          ? volunteer.contacts[0]
          : volunteer.contacts) as Record<string, unknown> | null;
        const volunteerType = normalizeText(volunteer.volunteer_type);
        const volunteerStatus = normalizeText(volunteer.volunteer_status);
        const hasBurnout = Boolean(volunteer.burnout_flag);
        const hasCaution = Boolean(volunteer.caution_flag) || Boolean(volunteer.soft_blacklist_flag);
        const reliability = toNumber(volunteer.reliability_score);
        const volunteerSkills = Array.isArray(volunteer.skills)
          ? (volunteer.skills as Array<unknown>).map((entry) => normalizeText(entry))
          : [];
        const volunteerInterests = Array.isArray(volunteer.interests)
          ? (volunteer.interests as Array<unknown>).map((entry) => normalizeText(entry))
          : [];
        const volunteerCerts = Array.isArray(volunteer.certifications)
          ? (volunteer.certifications as Array<unknown>).map((entry) => normalizeText(entry))
          : [];
        const profileTags = Array.from(new Set([...volunteerInterests, ...volunteerSkills, ...volunteerCerts]));
        const complianceRows = complianceItems.filter(
          (row) => toText(row.volunteer_profile_id) === volunteerId && normalizeText(row.compliance_status) === "completed"
        );
        const hasBackgroundClear =
          normalizeText(volunteer.background_check_status) === "clear" ||
          complianceRows.some((row) => normalizeText(row.compliance_type).includes("background"));
        const hasDriverEligibility = Boolean(volunteer.driver_eligible);

        let score = reliability;
        const reasons: string[] = [];
        const warnings: string[] = [];
        let eligible = true;

        const search = normalizeText(staffFilter.search);
        if (search) {
          const searchable = `${displayContactName(contact)} ${toText(contact?.email)} ${toText(contact?.phone)}`.toLowerCase();
          if (!searchable.includes(search)) {
            eligible = false;
            warnings.push("Does not match name/email/phone search.");
          }
        }

        if (requestedTags.length > 0 && !requestedTags.some((tag) => profileTags.includes(tag))) {
          eligible = false;
          warnings.push("Missing selected tag filters.");
        }
        if (requestedSkills.length > 0 && !requestedSkills.some((skill) => volunteerSkills.includes(skill))) {
          eligible = false;
          warnings.push("Missing selected skill filters.");
        }
        if (roleRequiredTags.length > 0) {
          const tagMatches = roleRequiredTags.filter((tag) => profileTags.includes(tag)).length;
          score += tagMatches * 8;
          if (tagMatches > 0) reasons.push(`Matches ${tagMatches} required tags`);
        }
        if (roleRequiredSkills.length > 0) {
          const skillMatches = roleRequiredSkills.filter((skill) => volunteerSkills.includes(skill)).length;
          score += skillMatches * 10;
          if (skillMatches > 0) reasons.push(`Matches ${skillMatches} required skills`);
          if (skillMatches === 0 && roleRequiredSkills.length > 0) warnings.push("No required skill match.");
        }
        if (roleRequiredCerts.length > 0) {
          const certMatches = roleRequiredCerts.filter((cert) => volunteerCerts.includes(cert)).length;
          score += certMatches * 12;
          if (certMatches > 0) reasons.push(`Matches ${certMatches} certifications`);
          if (certMatches === 0) warnings.push("No required certification match.");
        }

        if (roleRequiresBackground && !hasBackgroundClear) {
          eligible = false;
          warnings.push("Background check requirement not met.");
        }
        if (roleRequiresDriver && !hasDriverEligibility) {
          eligible = false;
          warnings.push("Driver eligibility required.");
        }
        if (!roleAllowsMinor && volunteerType === "minor") {
          eligible = false;
          warnings.push("Role does not allow minor volunteers.");
        }
        if (!roleAllowsGroup && volunteerType === "group_volunteer_participant") {
          eligible = false;
          warnings.push("Role does not allow group participants.");
        }
        if (!roleAllowsFamily && volunteerType === "family_member_volunteer") {
          eligible = false;
          warnings.push("Role does not allow family-member assignments.");
        }
        if (!staffFilter.includeDoNotSchedule && ["do_not_schedule", "soft_blacklisted"].includes(volunteerStatus)) {
          eligible = false;
          warnings.push("Volunteer is flagged Do Not Schedule / Soft Blacklisted.");
        }
        if (!staffFilter.includeBurnout && hasBurnout) {
          eligible = false;
          warnings.push("Volunteer has burnout flag.");
        }
        if (!staffFilter.includeCaution && hasCaution) {
          eligible = false;
          warnings.push("Volunteer has caution / reliability concerns.");
        }
        if (staffFilter.requireCompliant && complianceRows.length === 0) {
          eligible = false;
          warnings.push("No completed compliance records found.");
        }

        const isAssignedToThisShift = currentAssignments.some(
          (assignment) =>
            toText(assignment.volunteer_profile_id) === volunteerId &&
            toText(assignment.shift_id) === toText(selectedShift?.id) &&
            !["cancelled", "declined", "no_show"].includes(normalizeText(assignment.assignment_status))
        );

        const hasScheduleConflict = currentAssignments.some((assignment) => {
          if (toText(assignment.volunteer_profile_id) !== volunteerId) return false;
          const assignmentShift = shiftById.get(toText(assignment.shift_id));
          if (!assignmentShift || !selectedShift) return false;
          if (toText(assignment.shift_id) === toText(selectedShift.id)) return false;
          return overlapShifts(
            toText(assignmentShift.shift_start),
            toText(assignmentShift.shift_end),
            toText(selectedShift.shift_start),
            toText(selectedShift.shift_end)
          );
        });

        if (isAssignedToThisShift) {
          eligible = false;
          warnings.push("Already assigned to this shift.");
        }
        if (hasScheduleConflict) {
          eligible = false;
          warnings.push("Has overlapping assignment in this event.");
        }

        return {
          volunteerId,
          volunteerName: displayContactName(contact),
          email: toText(contact?.email),
          phone: toText(contact?.phone),
          score,
          reasons,
          warnings,
          eligible,
          isAssignedToThisShift,
          hasScheduleConflict
        } satisfies CandidateRecommendation;
      })
      .sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return b.score - a.score;
      });

    return {
      selectedShift,
      selectedRole,
      recommendations
    };
  }, [
    selectedShiftId,
    shiftById,
    roleById,
    staffFilter,
    volunteers,
    complianceItems,
    currentAssignments
  ]);

  const recommendationByShift = useMemo(() => {
    const map = new Map<string, CandidateRecommendation[]>();
    for (const shift of currentShifts) {
      const shiftId = toText(shift.id);
      const roleId = toText(shift.role_id);
      const role = roleById.get(roleId) ?? null;
      const roleRequiredSkills = Array.isArray(role?.required_skills)
        ? (role?.required_skills as Array<unknown>).map((entry) => normalizeText(entry))
        : [];
      const roleRequiredTags = Array.isArray(role?.required_tags)
        ? (role?.required_tags as Array<unknown>).map((entry) => normalizeText(entry))
        : [];

      const rows = volunteers
        .map((volunteer) => {
          const volunteerId = toText(volunteer.id);
          const contact = (Array.isArray(volunteer.contacts)
            ? volunteer.contacts[0]
            : volunteer.contacts) as Record<string, unknown> | null;
          const volunteerSkills = Array.isArray(volunteer.skills)
            ? (volunteer.skills as Array<unknown>).map((entry) => normalizeText(entry))
            : [];
          const volunteerInterests = Array.isArray(volunteer.interests)
            ? (volunteer.interests as Array<unknown>).map((entry) => normalizeText(entry))
            : [];
          const score =
            toNumber(volunteer.reliability_score) +
            roleRequiredSkills.filter((skill) => volunteerSkills.includes(skill)).length * 10 +
            roleRequiredTags.filter((tag) => volunteerInterests.includes(tag)).length * 6;
          const isAssignedToThisShift = currentAssignments.some(
            (assignment) => toText(assignment.volunteer_profile_id) === volunteerId && toText(assignment.shift_id) === shiftId
          );
          return {
            volunteerId,
            volunteerName: displayContactName(contact),
            email: toText(contact?.email),
            phone: toText(contact?.phone),
            score,
            reasons: [],
            warnings: [],
            eligible: !isAssignedToThisShift,
            isAssignedToThisShift,
            hasScheduleConflict: false
          } satisfies CandidateRecommendation;
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);
      map.set(shiftId, rows);
    }
    return map;
  }, [currentShifts, roleById, volunteers, currentAssignments]);

  function shiftFilledCount(shiftId: string) {
    return currentAssignments.filter(
      (assignment) =>
        toText(assignment.shift_id) === shiftId &&
        !["cancelled", "declined", "no_show"].includes(normalizeText(assignment.assignment_status))
    ).length;
  }

  function isShiftUnderfilled(shift: Record<string, unknown>) {
    const needed = Math.max(1, toNumber(shift.number_needed, 1));
    return shiftFilledCount(toText(shift.id)) < needed;
  }

  async function nextStep() {
    let canAdvance = true;
    if (step === 1) {
      canAdvance = await runStepAction(saveEventStep);
    } else if (step === 2) {
      canAdvance = await runStepAction(saveRecurrenceStep);
    } else if (step === 3) {
      setMessage("Step 3 complete. Add one or more roles, then continue.");
    } else if (step === 4) {
      canAdvance = await runStepAction(commitEventAfterStep4);
    } else if (step === 5) {
      setMessage("Step 5 complete. Proceed to waitlist/substitute setup.");
    }
    if (!canAdvance) return;
    setStep((prev) => (Math.min(6, prev + 1) as BuilderStep));
  }

  function previousStep() {
    setStep((prev) => (Math.max(1, prev - 1) as BuilderStep));
  }

  return (
    <div className="space-y-4">
      {schemaWarning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {schemaWarning}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="rounded-md border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Event Builder</h3>
            <p className="text-xs text-slate-600">
              Guided workflow: create event, define recurrence, build roles/shifts, staff, and configure fallbacks.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={currentEventId}
              onChange={(event) => {
                const value = event.target.value;
                setCurrentEventId(value);
                const existing = events.find((row) => toText(row.id) === value);
                if (existing) setFormFromEvent(existing);
              }}
            >
              <option value="">-- New Event --</option>
              {events.map((event) => (
                <option key={toText(event.id)} value={toText(event.id)}>
                  {toText(event.event_name)} ({toText(event.event_date)})
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={() => void loadData()} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {STEP_LABELS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setStep(entry.id)}
              className={`rounded-md border px-2 py-2 text-left text-xs ${
                step === entry.id
                  ? "border-sky-400 bg-sky-50 text-sky-700"
                  : entry.id < step
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </div>

      {step === 1 ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Step 1: Create the Event</h4>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Event Name" value={eventForm.eventName} onChange={(value) => setEventForm((prev) => ({ ...prev, eventName: value }))} />
            <FormField label="Event Type" value={eventForm.eventType} onChange={(value) => setEventForm((prev) => ({ ...prev, eventType: value }))} />
            <FormField
              label="Program / Department"
              value={eventForm.programDepartment}
              onChange={(value) => setEventForm((prev) => ({ ...prev, programDepartment: value }))}
            />
            <SelectField
              label="Event Status"
              value={eventForm.eventStatus}
              onChange={(value) => setEventForm((prev) => ({ ...prev, eventStatus: value }))}
              options={["draft", "recruiting", "full", "completed", "cancelled"]}
            />
            <FormField
              label="Event Date"
              type="date"
              value={eventForm.eventDate}
              onChange={(value) => setEventForm((prev) => ({ ...prev, eventDate: value }))}
            />
            <FormField
              label="Start Time"
              type="time"
              value={eventForm.startTime}
              onChange={(value) => setEventForm((prev) => ({ ...prev, startTime: value }))}
            />
            <FormField
              label="End Time"
              type="time"
              value={eventForm.endTime}
              onChange={(value) => setEventForm((prev) => ({ ...prev, endTime: value }))}
            />
            <FormField label="Location" value={eventForm.location} onChange={(value) => setEventForm((prev) => ({ ...prev, location: value }))} />
            <FormField
              label="Coordinator (User ID)"
              value={eventForm.coordinatorUserId}
              onChange={(value) => setEventForm((prev) => ({ ...prev, coordinatorUserId: value }))}
            />
            <TextAreaField
              label="Description"
              value={eventForm.eventDescription}
              onChange={(value) => setEventForm((prev) => ({ ...prev, eventDescription: value }))}
            />
            <TextAreaField label="Notes" value={eventForm.notes} onChange={(value) => setEventForm((prev) => ({ ...prev, notes: value }))} />
            <div className="rounded-md border border-slate-200 p-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Event Indicators</p>
              <div className="space-y-1">
                <CheckboxField label="Family-Friendly" checked={eventForm.familyFriendly} onChange={(checked) => setEventForm((prev) => ({ ...prev, familyFriendly: checked }))} />
                <CheckboxField label="Group Allowed" checked={eventForm.groupAllowed} onChange={(checked) => setEventForm((prev) => ({ ...prev, groupAllowed: checked }))} />
                <CheckboxField label="Minor Allowed" checked={eventForm.minorAllowed} onChange={(checked) => setEventForm((prev) => ({ ...prev, minorAllowed: checked }))} />
                <CheckboxField label="Meal Offered" checked={eventForm.mealOffered} onChange={(checked) => setEventForm((prev) => ({ ...prev, mealOffered: checked }))} />
                <CheckboxField label="T-Shirt Offered" checked={eventForm.tshirtOffered} onChange={(checked) => setEventForm((prev) => ({ ...prev, tshirtOffered: checked }))} />
              </div>
            </div>
            <FormField
              label="Meal Options (comma-separated)"
              value={eventForm.mealOptions}
              onChange={(value) => setEventForm((prev) => ({ ...prev, mealOptions: value }))}
            />
            <FormField
              label="T-Shirt Options (comma-separated)"
              value={eventForm.tshirtOptions}
              onChange={(value) => setEventForm((prev) => ({ ...prev, tshirtOptions: value }))}
            />
          </div>
          <div>
            <Button type="button" onClick={() => void runStepAction(saveEventStep)} disabled={submitting}>
              Save Step 1
            </Button>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Step 2: Designate Recurrence</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-slate-200 p-2">
              <CheckboxField
                label="Recurring Event"
                checked={recurrenceForm.isRecurring}
                onChange={(checked) => setRecurrenceForm((prev) => ({ ...prev, isRecurring: checked }))}
              />
              <p className="mt-1 text-xs text-slate-600">
                Unchecked = one-time event. Checked = recurring series with generation options.
              </p>
            </div>
            {recurrenceForm.isRecurring ? (
              <>
                <FormField
                  label="Series Name"
                  value={recurrenceForm.seriesName}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, seriesName: value }))}
                />
                <SelectField
                  label="Pattern"
                  value={recurrenceForm.recurrencePattern}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, recurrencePattern: value }))}
                  options={["daily", "weekly", "biweekly", "monthly", "custom"]}
                />
                <FormField
                  label="Interval"
                  type="number"
                  value={recurrenceForm.recurrenceInterval}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, recurrenceInterval: value }))}
                />
                <FormField
                  label="Days of Week (0-6)"
                  value={recurrenceForm.recurrenceDaysOfWeek}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, recurrenceDaysOfWeek: value }))}
                />
                <FormField
                  label="Day of Month"
                  type="number"
                  value={recurrenceForm.recurrenceDayOfMonth}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, recurrenceDayOfMonth: value }))}
                />
                <FormField
                  label="Starts On"
                  type="date"
                  value={recurrenceForm.startsOn}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, startsOn: value }))}
                />
                <FormField
                  label="Ends On"
                  type="date"
                  value={recurrenceForm.endsOn}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, endsOn: value }))}
                />
                <FormField
                  label="End After # Occurrences"
                  type="number"
                  value={recurrenceForm.endsAfterOccurrences}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, endsAfterOccurrences: value }))}
                />
                <FormField
                  label="Timezone"
                  value={recurrenceForm.timezone}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, timezone: value }))}
                />
                <TextAreaField
                  label="Recurrence Notes"
                  value={recurrenceForm.notes}
                  onChange={(value) => setRecurrenceForm((prev) => ({ ...prev, notes: value }))}
                />
              </>
            ) : null}
          </div>
          {recurrenceForm.seriesId ? (
            <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              Linked Series ID: {recurrenceForm.seriesId}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void runStepAction(saveRecurrenceStep)} disabled={submitting}>
              Save Step 2
            </Button>
            {recurrenceForm.seriesId ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void runStepAction(async () => {
                    await postJson(
                      `/api/volunteer-coordination/event-series/${encodeURIComponent(recurrenceForm.seriesId)}/generate`,
                      {
                        throughDate: recurrenceForm.endsOn || null,
                        maxOccurrences: recurrenceForm.endsAfterOccurrences
                          ? toNumber(recurrenceForm.endsAfterOccurrences)
                          : 24
                      }
                    );
                    setMessage("Generated recurring event instances.");
                    await loadData();
                  })
                }
              >
                Generate Future Occurrences
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Step 3: Set Up Roles for the Event</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Role Name" value={roleForm.roleName} onChange={(value) => setRoleForm((prev) => ({ ...prev, roleName: value }))} />
            <FormField
              label="Role Description"
              value={roleForm.roleDescription}
              onChange={(value) => setRoleForm((prev) => ({ ...prev, roleDescription: value }))}
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={roleForm.parentRoleId}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, parentRoleId: event.target.value }))}
            >
              <option value="">Parent Role (optional)</option>
              {currentRoles.map((role) => (
                <option key={toText(role.id)} value={toText(role.id)}>
                  {toText(role.role_name)}
                </option>
              ))}
            </select>
            <FormField
              label="Required Skills (comma-separated)"
              value={roleForm.requiredSkills}
              onChange={(value) => setRoleForm((prev) => ({ ...prev, requiredSkills: value }))}
            />
            <FormField
              label="Required Tags (comma-separated)"
              value={roleForm.requiredTags}
              onChange={(value) => setRoleForm((prev) => ({ ...prev, requiredTags: value }))}
            />
            <FormField
              label="Required Certifications / Training"
              value={roleForm.requiredCertifications}
              onChange={(value) => setRoleForm((prev) => ({ ...prev, requiredCertifications: value }))}
            />
            <FormField
              label="Required Training (comma-separated)"
              value={roleForm.requiredTraining}
              onChange={(value) => setRoleForm((prev) => ({ ...prev, requiredTraining: value }))}
            />
            <FormField
              label="Physical Requirements"
              value={roleForm.physicalRequirements}
              onChange={(value) => setRoleForm((prev) => ({ ...prev, physicalRequirements: value }))}
            />
            <TextAreaField label="Notes" value={roleForm.notes} onChange={(value) => setRoleForm((prev) => ({ ...prev, notes: value }))} />
            <div className="rounded-md border border-slate-200 p-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Eligibility / Flags</p>
              <div className="space-y-1">
                <CheckboxField label="Lead Role" checked={roleForm.isLeadRole} onChange={(checked) => setRoleForm((prev) => ({ ...prev, isLeadRole: checked }))} />
                <CheckboxField label="Minor Allowed" checked={roleForm.minorAllowed} onChange={(checked) => setRoleForm((prev) => ({ ...prev, minorAllowed: checked }))} />
                <CheckboxField label="Group Allowed" checked={roleForm.groupParticipantAllowed} onChange={(checked) => setRoleForm((prev) => ({ ...prev, groupParticipantAllowed: checked }))} />
                <CheckboxField label="Family Allowed" checked={roleForm.familyMemberAllowed} onChange={(checked) => setRoleForm((prev) => ({ ...prev, familyMemberAllowed: checked }))} />
                <CheckboxField label="Driver Eligibility Required" checked={roleForm.driverEligibilityRequired} onChange={(checked) => setRoleForm((prev) => ({ ...prev, driverEligibilityRequired: checked }))} />
                <CheckboxField label="Background Check Required" checked={roleForm.backgroundCheckRequired} onChange={(checked) => setRoleForm((prev) => ({ ...prev, backgroundCheckRequired: checked }))} />
                <CheckboxField label="Waitlist Enabled" checked={roleForm.waitlistEnabled} onChange={(checked) => setRoleForm((prev) => ({ ...prev, waitlistEnabled: checked }))} />
                <CheckboxField label="Substitute Enabled" checked={roleForm.substituteEnabled} onChange={(checked) => setRoleForm((prev) => ({ ...prev, substituteEnabled: checked }))} />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void runStepAction(saveRoleStep)} disabled={submitting}>
              Save Role
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setRoleForm({
                  id: "",
                  parentRoleId: "",
                  roleName: "",
                  roleDescription: "",
                  isLeadRole: false,
                  requiredSkills: "",
                  requiredTags: "",
                  requiredCertifications: "",
                  requiredTraining: "",
                  minorAllowed: true,
                  groupParticipantAllowed: true,
                  familyMemberAllowed: true,
                  driverEligibilityRequired: false,
                  backgroundCheckRequired: false,
                  physicalRequirements: "",
                  notes: "",
                  waitlistEnabled: true,
                  substituteEnabled: true
                })
              }
            >
              Clear
            </Button>
          </div>
          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Role</th>
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Required Skills</th>
                  <th className="px-3 py-2 font-medium">Required Tags</th>
                  <th className="px-3 py-2 font-medium">Eligibility Summary</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentRoles.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-500" colSpan={6}>
                      No roles defined yet.
                    </td>
                  </tr>
                ) : (
                  currentRoles.map((role) => (
                    <tr key={toText(role.id)} className="border-t border-slate-200">
                      <td className="px-3 py-2 font-medium text-slate-900">{toText(role.role_name)}</td>
                      <td className="px-3 py-2 text-slate-700">{Boolean(role.is_lead_role) ? "Yes" : "No"}</td>
                      <td className="px-3 py-2 text-slate-700">{joinCsv(role.required_skills) || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">{joinCsv(role.required_tags) || "—"}</td>
                      <td className="px-3 py-2 text-slate-700">
                        {Boolean(role.background_check_required) ? "Background Required; " : ""}
                        {Boolean(role.driver_eligibility_required) ? "Driver Required; " : ""}
                        {!Boolean(role.minor_allowed) ? "No Minors; " : ""}
                        {!Boolean(role.group_participant_allowed) ? "No Groups; " : ""}
                        {!Boolean(role.family_member_allowed) ? "No Families" : ""}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() =>
                            setRoleForm({
                              id: toText(role.id),
                              parentRoleId: toText(role.parent_role_id),
                              roleName: toText(role.role_name),
                              roleDescription: toText(role.role_description),
                              isLeadRole: Boolean(role.is_lead_role),
                              requiredSkills: joinCsv(role.required_skills),
                              requiredTags: joinCsv(role.required_tags),
                              requiredCertifications: joinCsv(role.required_certifications),
                              requiredTraining: joinCsv(role.required_training),
                              minorAllowed: Boolean(role.minor_allowed),
                              groupParticipantAllowed: Boolean(role.group_participant_allowed),
                              familyMemberAllowed: Boolean(role.family_member_allowed),
                              driverEligibilityRequired: Boolean(role.driver_eligibility_required),
                              backgroundCheckRequired: Boolean(role.background_check_required),
                              physicalRequirements: toText(role.physical_requirements),
                              notes: toText(role.notes),
                              waitlistEnabled: Boolean(role.waitlist_enabled),
                              substituteEnabled: Boolean(role.substitute_enabled)
                            })
                          }
                        >
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {step === 4 ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Step 4: Set Up Shifts</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={shiftForm.roleId}
              onChange={(event) => setShiftForm((prev) => ({ ...prev, roleId: event.target.value }))}
            >
              <option value="">Select role for shift</option>
              {currentRoles.map((role) => (
                <option key={toText(role.id)} value={toText(role.id)}>
                  {toText(role.role_name)}
                </option>
              ))}
            </select>
            <FormField
              label="Shift Name"
              value={shiftForm.shiftName}
              onChange={(value) => setShiftForm((prev) => ({ ...prev, shiftName: value }))}
            />
            <FormField
              label="Shift Start"
              type="time"
              value={shiftForm.shiftStart}
              onChange={(value) => setShiftForm((prev) => ({ ...prev, shiftStart: value }))}
            />
            <FormField
              label="Shift End"
              type="time"
              value={shiftForm.shiftEnd}
              onChange={(value) => setShiftForm((prev) => ({ ...prev, shiftEnd: value }))}
            />
            <FormField
              label="Volunteers Needed"
              type="number"
              value={shiftForm.numberNeeded}
              onChange={(value) => setShiftForm((prev) => ({ ...prev, numberNeeded: value }))}
            />
            <FormField
              label="Supervisor Contact ID"
              value={shiftForm.supervisorContactId}
              onChange={(value) => setShiftForm((prev) => ({ ...prev, supervisorContactId: value }))}
            />
            <FormField
              label="Check-In Location"
              value={shiftForm.checkInLocation}
              onChange={(value) => setShiftForm((prev) => ({ ...prev, checkInLocation: value }))}
            />
            <TextAreaField label="Notes" value={shiftForm.notes} onChange={(value) => setShiftForm((prev) => ({ ...prev, notes: value }))} />
            <div className="rounded-md border border-slate-200 p-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Fallback Controls</p>
              <div className="space-y-1">
                <CheckboxField label="Waitlist Enabled" checked={shiftForm.waitlistEnabled} onChange={(checked) => setShiftForm((prev) => ({ ...prev, waitlistEnabled: checked }))} />
                <CheckboxField label="Substitute Enabled" checked={shiftForm.substituteEnabled} onChange={(checked) => setShiftForm((prev) => ({ ...prev, substituteEnabled: checked }))} />
              </div>
              <FormField
                label="Max Waitlist Count"
                type="number"
                value={shiftForm.maxWaitlistCount}
                onChange={(value) => setShiftForm((prev) => ({ ...prev, maxWaitlistCount: value }))}
              />
              <FormField
                label="Max Substitute Pool Count"
                type="number"
                value={shiftForm.maxSubstituteCount}
                onChange={(value) => setShiftForm((prev) => ({ ...prev, maxSubstituteCount: value }))}
              />
              <SelectField
                label="Substitute Scope"
                value={shiftForm.substituteScope}
                onChange={(value) => setShiftForm((prev) => ({ ...prev, substituteScope: value as "shift" | "role" }))}
                options={["shift", "role"]}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void runStepAction(saveShiftStep)} disabled={submitting}>
              Save Shift
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setShiftForm((prev) => ({
                  ...prev,
                  id: "",
                  shiftName: "",
                  shiftStart: "",
                  shiftEnd: "",
                  numberNeeded: "1",
                  supervisorContactId: "",
                  checkInLocation: "",
                  notes: "",
                  maxWaitlistCount: "",
                  maxSubstituteCount: ""
                }))
              }
            >
              Clear
            </Button>
          </div>
          <div className="space-y-3">
            {currentRoles.map((role) => {
              const roleId = toText(role.id);
              const roleShiftsForRole = currentShifts.filter((shift) => toText(shift.role_id) === roleId);
              const totalNeeded = roleShiftsForRole.reduce((sum, shift) => sum + Math.max(1, toNumber(shift.number_needed, 1)), 0);
              return (
                <div key={roleId} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{toText(role.role_name)}</p>
                      <p className="text-xs text-slate-600">
                        {roleShiftsForRole.length} shifts • total volunteers needed: {totalNeeded}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 overflow-x-auto rounded-md border border-slate-200">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-3 py-2 font-medium">Shift</th>
                          <th className="px-3 py-2 font-medium">Time</th>
                          <th className="px-3 py-2 font-medium">Needed</th>
                          <th className="px-3 py-2 font-medium">Check-In</th>
                          <th className="px-3 py-2 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roleShiftsForRole.length === 0 ? (
                          <tr>
                            <td className="px-3 py-3 text-sm text-slate-500" colSpan={5}>
                              No shifts yet for this role.
                            </td>
                          </tr>
                        ) : (
                          roleShiftsForRole.map((shift) => (
                            <tr key={toText(shift.id)} className="border-t border-slate-200">
                              <td className="px-3 py-2 text-slate-700">{toText(shift.shift_name) || "Shift"}</td>
                              <td className="px-3 py-2 text-slate-700">
                                {toText(shift.shift_start)} - {toText(shift.shift_end)}
                              </td>
                              <td className="px-3 py-2 text-slate-700">{toNumber(shift.number_needed, 1)}</td>
                              <td className="px-3 py-2 text-slate-700">{toText(shift.check_in_location) || "—"}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      setShiftForm({
                                        id: toText(shift.id),
                                        roleId: roleId,
                                        shiftName: toText(shift.shift_name),
                                        shiftStart: toText(shift.shift_start),
                                        shiftEnd: toText(shift.shift_end),
                                        numberNeeded: String(Math.max(1, toNumber(shift.number_needed, 1))),
                                        supervisorContactId: toText(shift.supervisor_contact_id),
                                        checkInLocation: toText(shift.check_in_location),
                                        notes: toText(shift.notes),
                                        waitlistEnabled: Boolean(shift.waitlist_enabled),
                                        substituteEnabled: Boolean(shift.substitute_enabled),
                                        maxWaitlistCount: toText(shift.max_waitlist_count),
                                        maxSubstituteCount: toText(shift.max_substitute_count),
                                        substituteScope: toText(shift.substitute_scope) === "role" ? "role" : "shift"
                                      })
                                    }
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={() =>
                                      void runStepAction(async () => {
                                        await postJson("/api/volunteer-coordination/shifts", {
                                          eventId: currentEventId,
                                          roleId: roleId,
                                          shiftName: `${toText(shift.shift_name) || "Shift"} Copy`,
                                          shiftStart: toText(shift.shift_start),
                                          shiftEnd: toText(shift.shift_end),
                                          numberNeeded: Math.max(1, toNumber(shift.number_needed, 1)),
                                          supervisorContactId: toText(shift.supervisor_contact_id) || null,
                                          checkInLocation: toText(shift.check_in_location) || null,
                                          notes: toText(shift.notes) || null,
                                          waitlistEnabled: Boolean(shift.waitlist_enabled),
                                          substituteEnabled: Boolean(shift.substitute_enabled),
                                          maxWaitlistCount: shift.max_waitlist_count ?? null,
                                          maxSubstituteCount: shift.max_substitute_count ?? null,
                                          substituteScope: toText(shift.substitute_scope) === "role" ? "role" : "shift"
                                        });
                                        setMessage("Shift duplicated.");
                                        await loadData();
                                      })
                                    }
                                  >
                                    Duplicate
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Step 5: Staff the Shifts</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={selectedShiftId}
              onChange={(event) => setSelectedShiftId(event.target.value)}
            >
              <option value="">Select shift</option>
              {currentShifts.map((shift) => {
                const role = roleById.get(toText(shift.role_id));
                return (
                  <option key={toText(shift.id)} value={toText(shift.id)}>
                    {toText(role?.role_name)} • {toText(shift.shift_name) || "Shift"} ({toText(shift.shift_start)}-{toText(shift.shift_end)})
                  </option>
                );
              })}
            </select>
            <FormField
              label="Search Volunteer"
              value={staffFilter.search}
              onChange={(value) => setStaffFilter((prev) => ({ ...prev, search: value }))}
            />
            <FormField
              label="Tags Filter (comma-separated)"
              value={staffFilter.tags}
              onChange={(value) => setStaffFilter((prev) => ({ ...prev, tags: value }))}
            />
            <FormField
              label="Skills Filter (comma-separated)"
              value={staffFilter.skills}
              onChange={(value) => setStaffFilter((prev) => ({ ...prev, skills: value }))}
            />
            <div className="rounded-md border border-slate-200 p-2">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Safety Filters</p>
              <div className="space-y-1">
                <CheckboxField label="Include Burnout-Flagged" checked={staffFilter.includeBurnout} onChange={(checked) => setStaffFilter((prev) => ({ ...prev, includeBurnout: checked }))} />
                <CheckboxField label="Include Caution / Blacklist" checked={staffFilter.includeCaution} onChange={(checked) => setStaffFilter((prev) => ({ ...prev, includeCaution: checked }))} />
                <CheckboxField label="Include Do Not Schedule" checked={staffFilter.includeDoNotSchedule} onChange={(checked) => setStaffFilter((prev) => ({ ...prev, includeDoNotSchedule: checked }))} />
                <CheckboxField label="Require Compliance Rows" checked={staffFilter.requireCompliant} onChange={(checked) => setStaffFilter((prev) => ({ ...prev, requireCompliant: checked }))} />
              </div>
            </div>
          </div>

          {staffingContext.selectedShift ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>
                <span className="font-semibold text-slate-900">
                  {toText(staffingContext.selectedRole?.role_name)} • {toText(staffingContext.selectedShift.shift_name) || "Shift"}
                </span>{" "}
                ({toText(staffingContext.selectedShift.shift_start)} - {toText(staffingContext.selectedShift.shift_end)})
              </p>
              <p className="text-xs text-slate-600">
                Needed: {Math.max(1, toNumber(staffingContext.selectedShift.number_needed, 1))} • Assigned:{" "}
                {shiftFilledCount(toText(staffingContext.selectedShift.id))}
              </p>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Volunteer</th>
                  <th className="px-3 py-2 font-medium">Score</th>
                  <th className="px-3 py-2 font-medium">Eligibility</th>
                  <th className="px-3 py-2 font-medium">Reasons</th>
                  <th className="px-3 py-2 font-medium">Warnings</th>
                  <th className="px-3 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staffingContext.recommendations.slice(0, 50).map((candidate) => (
                  <tr key={candidate.volunteerId} className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-900">{candidate.volunteerName}</p>
                      <p className="text-xs text-slate-500">
                        {candidate.phone || "No phone"} {candidate.email ? `• ${candidate.email}` : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{candidate.score.toFixed(0)}</td>
                    <td className="px-3 py-2 text-slate-700">{candidate.eligible ? "Eligible" : "Not Eligible"}</td>
                    <td className="px-3 py-2 text-slate-700">{candidate.reasons.join("; ") || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{candidate.warnings.join("; ") || "—"}</td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!candidate.eligible || !selectedShiftId || submitting}
                        onClick={() =>
                          void runStepAction(async () => {
                            await assignVolunteerToShift(candidate.volunteerId, selectedShiftId);
                          })
                        }
                      >
                        Assign to Shift
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h5 className="text-sm font-semibold text-slate-900">Call Sheet for Unfilled Shifts</h5>
              <Button type="button" variant="secondary" onClick={() => window.print()}>
                Print Call Sheet
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Shift</th>
                    <th className="px-3 py-2 font-medium">Need Remaining</th>
                    <th className="px-3 py-2 font-medium">Suggested Volunteer</th>
                    <th className="px-3 py-2 font-medium">Phone / Email</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Notes</th>
                    <th className="px-3 py-2 font-medium">Assign</th>
                  </tr>
                </thead>
                <tbody>
                  {currentShifts.filter((shift) => isShiftUnderfilled(shift)).length === 0 ? (
                    <tr>
                      <td className="px-3 py-4 text-sm text-slate-500" colSpan={9}>
                        All shifts are currently filled.
                      </td>
                    </tr>
                  ) : (
                    currentShifts
                      .filter((shift) => isShiftUnderfilled(shift))
                      .flatMap((shift) => {
                        const shiftId = toText(shift.id);
                        const role = roleById.get(toText(shift.role_id));
                        const suggestions = recommendationByShift.get(shiftId) ?? [];
                        const needed = Math.max(1, toNumber(shift.number_needed, 1));
                        const filled = shiftFilledCount(shiftId);
                        const remaining = Math.max(0, needed - filled);
                        return suggestions.slice(0, Math.max(remaining, 3)).map((candidate) => ({
                          shift,
                          role,
                          candidate,
                          remaining
                        }));
                      })
                      .map(({ shift, role, candidate, remaining }) => {
                        const key = `${toText(shift.id)}:${candidate.volunteerId}`;
                        const tracking = callTracking[key] ?? { status: "not_called", notes: "" };
                        return (
                          <tr key={key} className="border-t border-slate-200">
                            <td className="px-3 py-2 text-slate-700">{eventForm.eventName || toText(currentEvent?.event_name)}</td>
                            <td className="px-3 py-2 text-slate-700">{toText(role?.role_name)}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {toText(shift.shift_name) || "Shift"} ({toText(shift.shift_start)} - {toText(shift.shift_end)})
                            </td>
                            <td className="px-3 py-2 text-slate-700">{remaining}</td>
                            <td className="px-3 py-2 text-slate-700">{candidate.volunteerName}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {candidate.phone || "No phone"}
                              {candidate.email ? <div>{candidate.email}</div> : null}
                            </td>
                            <td className="px-3 py-2">
                              <select
                                className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                                value={tracking.status}
                                onChange={(event) =>
                                  setCallTracking((prev) => ({
                                    ...prev,
                                    [key]: { ...tracking, status: event.target.value as CallStatus }
                                  }))
                                }
                              >
                                {callStatusOptions.map((statusOption) => (
                                  <option key={statusOption.value} value={statusOption.value}>
                                    {statusOption.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                value={tracking.notes}
                                onChange={(event) =>
                                  setCallTracking((prev) => ({
                                    ...prev,
                                    [key]: { ...tracking, notes: event.target.value }
                                  }))
                                }
                                placeholder="Call notes"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={!candidate.eligible || submitting}
                                onClick={() =>
                                  void runStepAction(async () => {
                                    await assignVolunteerToShift(candidate.volunteerId, toText(shift.id));
                                    setCallTracking((prev) => ({
                                      ...prev,
                                      [key]: {
                                        status: "confirmed",
                                        notes: tracking.notes
                                      }
                                    }));
                                  })
                                }
                              >
                                Assign
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {step === 6 ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-3">
          <h4 className="text-sm font-semibold text-slate-900">Step 6: Build Waitlists and Substitute Options</h4>
          <div className="grid gap-3 md:grid-cols-3">
            <SelectField
              label="Fallback Scope"
              value={fallbackScope}
              onChange={(value) => setFallbackScope(value as "role" | "shift")}
              options={["role", "shift"]}
            />
            <select
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={fallbackRoleId}
              onChange={(event) => {
                const nextRoleId = event.target.value;
                setFallbackRoleId(nextRoleId);
                const role = roleById.get(nextRoleId);
                if (role) {
                  setFallbackSettings((prev) => ({
                    ...prev,
                    waitlistEnabled: Boolean(role.waitlist_enabled),
                    substituteEnabled: Boolean(role.substitute_enabled)
                  }));
                }
              }}
            >
              <option value="">Select role</option>
              {currentRoles.map((role) => (
                <option key={toText(role.id)} value={toText(role.id)}>
                  {toText(role.role_name)}
                </option>
              ))}
            </select>
            {fallbackScope === "shift" ? (
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={fallbackShiftId}
                onChange={(event) => {
                  const nextShiftId = event.target.value;
                  setFallbackShiftId(nextShiftId);
                  const shift = shiftById.get(nextShiftId);
                  if (shift) {
                    setFallbackSettings({
                      waitlistEnabled: Boolean(shift.waitlist_enabled),
                      substituteEnabled: Boolean(shift.substitute_enabled),
                      maxWaitlistCount: toText(shift.max_waitlist_count),
                      maxSubstituteCount: toText(shift.max_substitute_count),
                      substituteScope: toText(shift.substitute_scope) === "role" ? "role" : "shift"
                    });
                  }
                }}
              >
                <option value="">Select shift</option>
                {currentShifts
                  .filter((shift) => !fallbackRoleId || toText(shift.role_id) === fallbackRoleId)
                  .map((shift) => (
                    <option key={toText(shift.id)} value={toText(shift.id)}>
                      {toText(shift.shift_name) || "Shift"} ({toText(shift.shift_start)}-{toText(shift.shift_end)})
                    </option>
                  ))}
              </select>
            ) : (
              <div />
            )}
            <div className="rounded-md border border-slate-200 p-2">
              <CheckboxField
                label="Waitlist Enabled"
                checked={fallbackSettings.waitlistEnabled}
                onChange={(checked) => setFallbackSettings((prev) => ({ ...prev, waitlistEnabled: checked }))}
              />
              <CheckboxField
                label="Substitute Enabled"
                checked={fallbackSettings.substituteEnabled}
                onChange={(checked) => setFallbackSettings((prev) => ({ ...prev, substituteEnabled: checked }))}
              />
            </div>
            <FormField
              label="Max Waitlist Count"
              type="number"
              value={fallbackSettings.maxWaitlistCount}
              onChange={(value) => setFallbackSettings((prev) => ({ ...prev, maxWaitlistCount: value }))}
            />
            <FormField
              label="Max Substitute Pool Count"
              type="number"
              value={fallbackSettings.maxSubstituteCount}
              onChange={(value) => setFallbackSettings((prev) => ({ ...prev, maxSubstituteCount: value }))}
            />
            <SelectField
              label="Substitute Pool Type"
              value={fallbackSettings.substituteScope}
              onChange={(value) =>
                setFallbackSettings((prev) => ({ ...prev, substituteScope: value as "role" | "shift" }))
              }
              options={["shift", "role"]}
            />
          </div>
          <Button type="button" onClick={() => void runStepAction(saveFallbackConfiguration)} disabled={submitting}>
            Save Fallback Configuration
          </Button>

          <div className="grid gap-3 xl:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Add Waitlist Entry</p>
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={waitlistForm.volunteerProfileId}
                  onChange={(event) =>
                    setWaitlistForm((prev) => ({ ...prev, volunteerProfileId: event.target.value }))
                  }
                >
                  <option value="">Select volunteer</option>
                  {volunteers.map((volunteer) => {
                    const contact = (Array.isArray(volunteer.contacts)
                      ? volunteer.contacts[0]
                      : volunteer.contacts) as Record<string, unknown> | null;
                    return (
                      <option key={toText(volunteer.id)} value={toText(volunteer.id)}>
                        {displayContactName(contact)}
                      </option>
                    );
                  })}
                </select>
                <FormField
                  label="Waitlist Order"
                  type="number"
                  value={waitlistForm.waitlistOrder}
                  onChange={(value) => setWaitlistForm((prev) => ({ ...prev, waitlistOrder: value }))}
                />
                <SelectField
                  label="Entry Status"
                  value={waitlistForm.entryStatus}
                  onChange={(value) => setWaitlistForm((prev) => ({ ...prev, entryStatus: value }))}
                  options={["waiting", "promoted", "removed"]}
                />
                <FormField
                  label="Notes"
                  value={waitlistForm.notes}
                  onChange={(value) => setWaitlistForm((prev) => ({ ...prev, notes: value }))}
                />
              </div>
              <Button type="button" className="mt-2" variant="secondary" onClick={() => void runStepAction(saveWaitlistEntry)}>
                Save Waitlist Entry
              </Button>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Add Substitute Entry</p>
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={substituteForm.volunteerProfileId}
                  onChange={(event) =>
                    setSubstituteForm((prev) => ({ ...prev, volunteerProfileId: event.target.value }))
                  }
                >
                  <option value="">Select volunteer</option>
                  {volunteers.map((volunteer) => {
                    const contact = (Array.isArray(volunteer.contacts)
                      ? volunteer.contacts[0]
                      : volunteer.contacts) as Record<string, unknown> | null;
                    return (
                      <option key={toText(volunteer.id)} value={toText(volunteer.id)}>
                        {displayContactName(contact)}
                      </option>
                    );
                  })}
                </select>
                <SelectField
                  label="Availability Status"
                  value={substituteForm.availabilityStatus}
                  onChange={(value) => setSubstituteForm((prev) => ({ ...prev, availabilityStatus: value }))}
                  options={["available", "unavailable", "assigned"]}
                />
                <FormField
                  label="Priority Order"
                  type="number"
                  value={substituteForm.priorityOrder}
                  onChange={(value) => setSubstituteForm((prev) => ({ ...prev, priorityOrder: value }))}
                />
                <FormField
                  label="Notes"
                  value={substituteForm.notes}
                  onChange={(value) => setSubstituteForm((prev) => ({ ...prev, notes: value }))}
                />
              </div>
              <Button type="button" className="mt-2" variant="secondary" onClick={() => void runStepAction(saveSubstituteEntry)}>
                Save Substitute Entry
              </Button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-2">
            <SimpleTable
              title="Current Waitlist"
              headers={["Role", "Shift", "Volunteer", "Order", "Status"]}
              rows={currentWaitlistEntries.map((entry) => {
                const volunteer = volunteerById.get(toText(entry.volunteer_profile_id));
                const contact = (Array.isArray(volunteer?.contacts)
                  ? volunteer?.contacts[0]
                  : volunteer?.contacts) as Record<string, unknown> | null;
                const role = roleById.get(toText(entry.role_id));
                const shift = shiftById.get(toText(entry.shift_id));
                return [
                  toText(role?.role_name),
                  toText(shift?.shift_name) || `${toText(shift?.shift_start)}-${toText(shift?.shift_end)}`,
                  displayContactName(contact),
                  toText(entry.waitlist_order),
                  toText(entry.entry_status)
                ];
              })}
            />
            <SimpleTable
              title="Current Substitutes"
              headers={["Role", "Shift", "Volunteer", "Priority", "Status"]}
              rows={currentSubstituteEntries.map((entry) => {
                const volunteer = volunteerById.get(toText(entry.volunteer_profile_id));
                const contact = (Array.isArray(volunteer?.contacts)
                  ? volunteer?.contacts[0]
                  : volunteer?.contacts) as Record<string, unknown> | null;
                const role = roleById.get(toText(entry.role_id));
                const shift = shiftById.get(toText(entry.shift_id));
                return [
                  toText(role?.role_name) || "General",
                  toText(shift?.shift_name) || `${toText(shift?.shift_start)}-${toText(shift?.shift_end)}`,
                  displayContactName(contact),
                  toText(entry.priority_order),
                  toText(entry.availability_status)
                ];
              })}
            />
          </div>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 p-3">
        <Button type="button" variant="secondary" onClick={previousStep} disabled={step === 1 || submitting}>
          Back
        </Button>
        <div className="text-xs text-slate-600">Current step: {STEP_LABELS.find((entry) => entry.id === step)?.label}</div>
        <Button type="button" onClick={() => void nextStep()} disabled={step === 6 || submitting}>
          Next
        </Button>
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      <select
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1">
      <span className="block text-xs font-medium text-slate-600">{label}</span>
      <textarea
        className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
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

function SimpleTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-900">{title}</p>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              {headers.map((header) => (
                <th key={header} className="px-3 py-2 font-medium">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-4 text-sm text-slate-500" colSpan={headers.length}>
                  No records yet.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr key={`${title}-${index}`} className="border-t border-slate-200">
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${index}-${cellIndex}`} className="px-3 py-2 text-slate-700">
                      {cell || "—"}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
