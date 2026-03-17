import { NextResponse } from "next/server";
import {
  commitVolunteerHourImport,
  createVolunteerEventSeries,
  getVolunteerCoordinationData,
  stageVolunteerHourImport,
  updateVolunteerHourImportRow,
  upsertSubstituteEntry,
  upsertVolunteerAssignment,
  upsertVolunteerBurnoutFlag,
  upsertVolunteerComplianceItem,
  upsertVolunteerConcern,
  upsertVolunteerEvent,
  upsertVolunteerFamily,
  upsertVolunteerFamilyMember,
  upsertVolunteerGroup,
  upsertVolunteerGroupMember,
  upsertVolunteerIncident,
  upsertVolunteerProfile,
  upsertVolunteerRole,
  upsertVolunteerRoleShift,
  upsertWaitlistEntry
} from "@/lib/volunteer-coordination/service";

function errorResponse(error: unknown, fallback: string) {
  const value = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };
  return NextResponse.json(
    {
      message: toText(value?.message) || fallback,
      details: value?.details ?? null,
      hint: value?.hint ?? null,
      code: value?.code ?? null
    },
    { status: 500 }
  );
}

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tagIds = url.searchParams.getAll("tagId").filter(Boolean);
    const data = await getVolunteerCoordinationData({
      volunteerStatus: url.searchParams.get("volunteerStatus") ?? undefined,
      assignmentStatus: url.searchParams.get("assignmentStatus") ?? undefined,
      eventType: url.searchParams.get("eventType") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
      burnoutOnly: url.searchParams.get("burnoutOnly") === "true",
      cautionOnly: url.searchParams.get("cautionOnly") === "true",
      tagIds: tagIds.length > 0 ? tagIds : undefined
    });
    return NextResponse.json(data);
  } catch (error) {
    return errorResponse(error, "Unable to load Volunteer Coordination data.");
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const action = toText(payload.action).toLowerCase();

    let result: unknown;
    if (action === "upsert_volunteer_profile") {
      result = await upsertVolunteerProfile({
        id: payload.id,
        contactId: payload.contactId,
        volunteerStatus: payload.volunteerStatus,
        volunteerType: payload.volunteerType,
        availabilityPreferences: payload.availabilityPreferences,
        interests: payload.interests ?? [],
        skills: payload.skills ?? [],
        certifications: payload.certifications ?? [],
        accommodations: payload.accommodations,
        physicalLimitations: payload.physicalLimitations,
        transportationEligible: payload.transportationEligible,
        driverEligible: payload.driverEligible,
        emergencyContactName: payload.emergencyContactName,
        emergencyContactPhone: payload.emergencyContactPhone,
        internalNotes: payload.internalNotes,
        internalConcerns: payload.internalConcerns,
        burnoutFlag: payload.burnoutFlag,
        cautionFlag: payload.cautionFlag,
        softBlacklistFlag: payload.softBlacklistFlag,
        doNotScheduleUntil: payload.doNotScheduleUntil,
        guardianConsentStatus: payload.guardianConsentStatus,
        waiverSigned: payload.waiverSigned,
        minorRequiresGuardianPresent: payload.minorRequiresGuardianPresent,
        backgroundCheckStatus: payload.backgroundCheckStatus,
        backgroundCheckExpiresAt: payload.backgroundCheckExpiresAt,
        orientationCompletedAt: payload.orientationCompletedAt,
        confidentialityAcknowledgedAt: payload.confidentialityAcknowledgedAt
      });
    } else if (action === "upsert_event") {
      result = await upsertVolunteerEvent({
        id: payload.id,
        eventName: payload.eventName,
        eventType: payload.eventType,
        programDepartment: payload.programDepartment,
        eventStatus: payload.eventStatus,
        eventDescription: payload.eventDescription,
        eventDate: payload.eventDate,
        startTime: payload.startTime,
        endTime: payload.endTime,
        location: payload.location,
        coordinatorUserId: payload.coordinatorUserId,
        visibility: payload.visibility,
        capacityTotal: payload.capacityTotal,
        notes: payload.notes,
        mealOptions: payload.mealOptions ?? [],
        tshirtOptions: payload.tshirtOptions ?? [],
        familyFriendly: payload.familyFriendly,
        groupAllowed: payload.groupAllowed,
        minorAllowed: payload.minorAllowed,
        seriesId: payload.seriesId,
        isSeriesOverride: payload.isSeriesOverride
      });
    } else if (action === "create_event_series") {
      result = await createVolunteerEventSeries({
        seriesName: payload.seriesName,
        recurrencePattern: payload.recurrencePattern,
        recurrenceInterval: payload.recurrenceInterval,
        recurrenceDaysOfWeek: payload.recurrenceDaysOfWeek ?? [],
        recurrenceDayOfMonth: payload.recurrenceDayOfMonth,
        startsOn: payload.startsOn,
        endsOn: payload.endsOn,
        endsAfterOccurrences: payload.endsAfterOccurrences,
        timezone: payload.timezone,
        notes: payload.notes
      });
    } else if (action === "upsert_role") {
      result = await upsertVolunteerRole({
        id: payload.id,
        eventId: payload.eventId,
        parentRoleId: payload.parentRoleId,
        roleName: payload.roleName,
        roleDescription: payload.roleDescription,
        shiftStart: payload.shiftStart,
        shiftEnd: payload.shiftEnd,
        numberNeeded: payload.numberNeeded,
        waitlistEnabled: payload.waitlistEnabled,
        substituteEnabled: payload.substituteEnabled,
        isLeadRole: payload.isLeadRole,
        requiredSkills: payload.requiredSkills ?? [],
        requiredTags: payload.requiredTags ?? [],
        requiredCertifications: payload.requiredCertifications ?? [],
        requiredTraining: payload.requiredTraining ?? [],
        backgroundCheckRequired: payload.backgroundCheckRequired,
        driverEligibilityRequired: payload.driverEligibilityRequired,
        minorAllowed: payload.minorAllowed,
        familyMemberAllowed: payload.familyMemberAllowed,
        groupParticipantAllowed: payload.groupParticipantAllowed,
        physicalRequirements: payload.physicalRequirements,
        mealEligible: payload.mealEligible,
        tshirtEligible: payload.tshirtEligible,
        checkInLocation: payload.checkInLocation,
        supervisorContactId: payload.supervisorContactId,
        notes: payload.notes
      });
    } else if (action === "upsert_role_shift") {
      result = await upsertVolunteerRoleShift({
        id: payload.id,
        eventId: payload.eventId,
        roleId: payload.roleId,
        shiftName: payload.shiftName,
        shiftStart: payload.shiftStart,
        shiftEnd: payload.shiftEnd,
        numberNeeded: payload.numberNeeded,
        supervisorContactId: payload.supervisorContactId,
        checkInLocation: payload.checkInLocation,
        notes: payload.notes,
        waitlistEnabled: payload.waitlistEnabled,
        substituteEnabled: payload.substituteEnabled,
        maxWaitlistCount: payload.maxWaitlistCount,
        maxSubstituteCount: payload.maxSubstituteCount,
        substituteScope: payload.substituteScope
      });
    } else if (action === "upsert_assignment") {
      result = await upsertVolunteerAssignment({
        id: payload.id,
        volunteerProfileId: payload.volunteerProfileId,
        eventId: payload.eventId,
        roleId: payload.roleId,
        shiftId: payload.shiftId,
        familyId: payload.familyId,
        groupId: payload.groupId,
        assignmentStatus: payload.assignmentStatus,
        scheduledHours: payload.scheduledHours,
        actualHours: payload.actualHours,
        checkInAt: payload.checkInAt,
        checkOutAt: payload.checkOutAt,
        approvalStatus: payload.approvalStatus,
        isLateArrival: payload.isLateArrival,
        isEarlyDeparture: payload.isEarlyDeparture,
        lateCancelled: payload.lateCancelled,
        notes: payload.notes,
        noShowReason: payload.noShowReason
      });
    } else if (action === "upsert_waitlist_entry") {
      result = await upsertWaitlistEntry({
        id: payload.id,
        eventId: payload.eventId,
        roleId: payload.roleId,
        shiftId: payload.shiftId,
        volunteerProfileId: payload.volunteerProfileId,
        waitlistOrder: payload.waitlistOrder,
        entryStatus: payload.entryStatus,
        notes: payload.notes
      });
    } else if (action === "upsert_substitute_entry") {
      result = await upsertSubstituteEntry({
        id: payload.id,
        eventId: payload.eventId,
        roleId: payload.roleId,
        shiftId: payload.shiftId,
        volunteerProfileId: payload.volunteerProfileId,
        availabilityStatus: payload.availabilityStatus,
        priorityOrder: payload.priorityOrder,
        notes: payload.notes
      });
    } else if (action === "upsert_family") {
      result = await upsertVolunteerFamily({
        id: payload.id,
        familyName: payload.familyName,
        mustServeTogether: payload.mustServeTogether,
        notes: payload.notes
      });
    } else if (action === "upsert_family_member") {
      result = await upsertVolunteerFamilyMember({
        familyId: payload.familyId,
        contactId: payload.contactId,
        roleInFamily: payload.roleInFamily,
        isPrimaryContact: payload.isPrimaryContact,
        notes: payload.notes
      });
    } else if (action === "upsert_group") {
      result = await upsertVolunteerGroup({
        id: payload.id,
        groupName: payload.groupName,
        groupType: payload.groupType,
        groupStatus: payload.groupStatus,
        coordinatorContactId: payload.coordinatorContactId,
        estimatedAttendance: payload.estimatedAttendance,
        confirmedAttendance: payload.confirmedAttendance,
        notes: payload.notes
      });
    } else if (action === "upsert_group_member") {
      result = await upsertVolunteerGroupMember({
        groupId: payload.groupId,
        contactId: payload.contactId,
        displayName: payload.displayName,
        isPlaceholder: payload.isPlaceholder,
        participationStatus: payload.participationStatus,
        notes: payload.notes
      });
    } else if (action === "upsert_compliance_item") {
      result = await upsertVolunteerComplianceItem({
        id: payload.id,
        volunteerProfileId: payload.volunteerProfileId,
        complianceType: payload.complianceType,
        complianceStatus: payload.complianceStatus,
        completedAt: payload.completedAt,
        expiresAt: payload.expiresAt,
        requiredForRoles: payload.requiredForRoles ?? [],
        notes: payload.notes
      });
    } else if (action === "upsert_concern") {
      result = await upsertVolunteerConcern({
        id: payload.id,
        volunteerProfileId: payload.volunteerProfileId,
        concernCategory: payload.concernCategory,
        concernType: payload.concernType,
        severity: payload.severity,
        concernDate: payload.concernDate,
        reviewStatus: payload.reviewStatus,
        actionLevel: payload.actionLevel,
        roleRestrictions: payload.roleRestrictions ?? [],
        eventRestrictions: payload.eventRestrictions ?? [],
        notes: payload.notes,
        internalReviewNotes: payload.internalReviewNotes
      });
    } else if (action === "upsert_burnout_flag") {
      result = await upsertVolunteerBurnoutFlag({
        id: payload.id,
        volunteerProfileId: payload.volunteerProfileId,
        flagType: payload.flagType,
        status: payload.status,
        pauseDays: payload.pauseDays,
        pauseUntil: payload.pauseUntil,
        reason: payload.reason
      });
    } else if (action === "upsert_incident") {
      result = await upsertVolunteerIncident({
        id: payload.id,
        eventId: payload.eventId,
        roleId: payload.roleId,
        assignmentId: payload.assignmentId,
        incidentAt: payload.incidentAt,
        incidentCategory: payload.incidentCategory,
        severity: payload.severity,
        description: payload.description,
        witnesses: payload.witnesses,
        actionTaken: payload.actionTaken,
        followUpRequired: payload.followUpRequired,
        followUpNotes: payload.followUpNotes,
        resolved: payload.resolved,
        internalOnly: payload.internalOnly,
        attachmentUrls: payload.attachmentUrls ?? [],
        incidentPeople: payload.incidentPeople ?? []
      });
    } else if (action === "stage_hour_import") {
      result = await stageVolunteerHourImport({
        eventId: payload.eventId,
        sourceFilename: payload.sourceFilename,
        columnMapping: payload.columnMapping ?? {},
        rows: payload.rows ?? []
      });
    } else if (action === "update_hour_import_row") {
      result = await updateVolunteerHourImportRow({
        importRowId: payload.importRowId,
        matchedContactId: payload.matchedContactId,
        matchedVolunteerProfileId: payload.matchedVolunteerProfileId,
        stageStatus: payload.stageStatus,
        errorMessage: payload.errorMessage
      });
    } else if (action === "commit_hour_import") {
      result = await commitVolunteerHourImport({
        importId: payload.importId
      });
    } else {
      return NextResponse.json({ message: `Unsupported action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return errorResponse(error, "Unable to execute Volunteer Coordination action.");
  }
}
