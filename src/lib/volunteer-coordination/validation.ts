import { z } from "zod";

const uuidSchema = z.string().uuid();
const nullableString = z.string().trim().optional().nullable();
const csvStringArray = z.array(z.string().trim()).optional();

export const volunteerProfileUpsertSchema = z.object({
  id: uuidSchema.optional(),
  contactId: uuidSchema,
  volunteerStatus: z.enum([
    "active",
    "inactive",
    "prospective",
    "do_not_schedule",
    "soft_blacklisted",
    "archived"
  ]),
  volunteerType: z.enum([
    "individual",
    "minor",
    "family_member_volunteer",
    "group_volunteer_participant",
    "team_leader"
  ]),
  availabilityPreferences: z.record(z.string(), z.unknown()).optional(),
  interests: z.array(z.string().trim()).optional(),
  skills: z.array(z.string().trim()).optional(),
  certifications: z.array(z.string().trim()).optional(),
  accommodations: nullableString,
  physicalLimitations: nullableString,
  transportationEligible: z.boolean().optional(),
  driverEligible: z.boolean().optional(),
  emergencyContactName: nullableString,
  emergencyContactPhone: nullableString,
  internalNotes: nullableString,
  internalConcerns: nullableString,
  burnoutFlag: z.boolean().optional(),
  cautionFlag: z.boolean().optional(),
  softBlacklistFlag: z.boolean().optional(),
  doNotScheduleUntil: nullableString,
  guardianConsentStatus: z
    .enum(["not_required", "pending", "approved", "denied", "expired"])
    .optional(),
  waiverSigned: z.boolean().optional(),
  minorRequiresGuardianPresent: z.boolean().optional(),
  backgroundCheckStatus: z.enum(["pending", "clear", "failed", "expired", "not_required"]).optional(),
  backgroundCheckExpiresAt: nullableString,
  orientationCompletedAt: nullableString,
  confidentialityAcknowledgedAt: nullableString
});

export const eventSeriesCreateSchema = z.object({
  seriesName: z.string().trim().min(2),
  recurrencePattern: z.enum(["daily", "weekly", "biweekly", "monthly", "custom"]),
  recurrenceInterval: z.coerce.number().int().min(1).max(365).optional(),
  recurrenceDaysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  recurrenceDayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
  startsOn: z.string().trim().min(1),
  endsOn: nullableString,
  endsAfterOccurrences: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  timezone: z.string().trim().min(1).optional(),
  notes: nullableString
});

export const eventSeriesGenerateSchema = z.object({
  throughDate: nullableString,
  maxOccurrences: z.coerce.number().int().min(1).max(1000).optional().nullable()
});

export const volunteerEventUpsertSchema = z.object({
  id: uuidSchema.optional(),
  eventName: z.string().trim().min(2),
  eventType: nullableString,
  programDepartment: nullableString,
  eventStatus: z.enum(["draft", "recruiting", "full", "completed", "cancelled"]).optional(),
  eventDescription: nullableString,
  eventDate: z.string().trim().min(1),
  startTime: z.string().trim().min(1),
  endTime: z.string().trim().min(1),
  location: nullableString,
  coordinatorUserId: nullableString,
  visibility: z.enum(["public", "private", "internal"]).optional(),
  capacityTotal: z.coerce.number().int().min(0).max(100000).optional(),
  notes: nullableString,
  mealOptions: csvStringArray,
  tshirtOptions: csvStringArray,
  familyFriendly: z.boolean().optional(),
  groupAllowed: z.boolean().optional(),
  minorAllowed: z.boolean().optional(),
  seriesId: nullableString,
  isSeriesOverride: z.boolean().optional()
});

export const volunteerRoleUpsertSchema = z.object({
  id: uuidSchema.optional(),
  eventId: uuidSchema,
  parentRoleId: nullableString,
  roleName: z.string().trim().min(2),
  roleDescription: nullableString,
  shiftStart: nullableString,
  shiftEnd: nullableString,
  numberNeeded: z.coerce.number().int().min(1).max(10000).optional(),
  waitlistEnabled: z.boolean().optional(),
  substituteEnabled: z.boolean().optional(),
  isLeadRole: z.boolean().optional(),
  requiredSkills: csvStringArray,
  requiredTags: csvStringArray,
  requiredCertifications: csvStringArray,
  requiredTraining: csvStringArray,
  backgroundCheckRequired: z.boolean().optional(),
  driverEligibilityRequired: z.boolean().optional(),
  minorAllowed: z.boolean().optional(),
  familyMemberAllowed: z.boolean().optional(),
  groupParticipantAllowed: z.boolean().optional(),
  physicalRequirements: nullableString,
  mealEligible: z.boolean().optional(),
  tshirtEligible: z.boolean().optional(),
  checkInLocation: nullableString,
  supervisorContactId: nullableString,
  notes: nullableString
});

export const volunteerAssignmentUpsertSchema = z.object({
  id: uuidSchema.optional(),
  volunteerProfileId: uuidSchema,
  eventId: uuidSchema,
  roleId: nullableString,
  familyId: nullableString,
  groupId: nullableString,
  assignmentStatus: z.enum([
    "invited",
    "interested",
    "pending_approval",
    "confirmed",
    "waitlisted",
    "substitute",
    "cancelled",
    "declined",
    "no_show",
    "completed"
  ]),
  scheduledHours: z.coerce.number().min(0).max(1000).optional().nullable(),
  actualHours: z.coerce.number().min(0).max(1000).optional().nullable(),
  checkInAt: nullableString,
  checkOutAt: nullableString,
  approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
  isLateArrival: z.boolean().optional(),
  isEarlyDeparture: z.boolean().optional(),
  lateCancelled: z.boolean().optional(),
  notes: nullableString,
  noShowReason: nullableString
});

export const waitlistUpsertSchema = z.object({
  id: uuidSchema.optional(),
  eventId: uuidSchema,
  roleId: uuidSchema,
  volunteerProfileId: uuidSchema,
  waitlistOrder: z.coerce.number().int().min(1).max(10000).optional(),
  entryStatus: z.enum(["waiting", "promoted", "removed"]).optional(),
  notes: nullableString
});

export const substituteUpsertSchema = z.object({
  id: uuidSchema.optional(),
  eventId: uuidSchema,
  roleId: nullableString,
  volunteerProfileId: uuidSchema,
  availabilityStatus: z.enum(["available", "unavailable", "assigned"]).optional(),
  priorityOrder: z.coerce.number().int().min(1).max(10000).optional(),
  notes: nullableString
});

export const familyUpsertSchema = z.object({
  id: uuidSchema.optional(),
  familyName: z.string().trim().min(2),
  mustServeTogether: z.boolean().optional(),
  notes: nullableString
});

export const familyMemberUpsertSchema = z.object({
  familyId: uuidSchema,
  contactId: uuidSchema,
  roleInFamily: nullableString,
  isPrimaryContact: z.boolean().optional(),
  notes: nullableString
});

export const groupUpsertSchema = z.object({
  id: uuidSchema.optional(),
  groupName: z.string().trim().min(2),
  groupType: nullableString,
  groupStatus: z.enum(["active", "inactive", "archived"]).optional(),
  coordinatorContactId: nullableString,
  estimatedAttendance: z.coerce.number().int().min(0).max(100000).optional(),
  confirmedAttendance: z.coerce.number().int().min(0).max(100000).optional(),
  notes: nullableString
});

export const groupMemberUpsertSchema = z.object({
  groupId: uuidSchema,
  contactId: nullableString,
  displayName: nullableString,
  isPlaceholder: z.boolean().optional(),
  participationStatus: z.enum(["estimated", "confirmed", "attended", "cancelled"]).optional(),
  notes: nullableString
});

export const complianceUpsertSchema = z.object({
  id: uuidSchema.optional(),
  volunteerProfileId: uuidSchema,
  complianceType: z.string().trim().min(1),
  complianceStatus: z.enum(["pending", "completed", "expired", "exempt", "rejected"]),
  completedAt: nullableString,
  expiresAt: nullableString,
  requiredForRoles: csvStringArray,
  notes: nullableString
});

export const concernUpsertSchema = z.object({
  id: uuidSchema.optional(),
  volunteerProfileId: uuidSchema,
  concernCategory: z.string().trim().min(1),
  concernType: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  concernDate: nullableString,
  reviewStatus: z.enum(["open", "under_review", "resolved", "archived"]).optional(),
  actionLevel: z
    .enum([
      "caution_only",
      "role_restricted",
      "event_restricted",
      "temporarily_do_not_schedule",
      "soft_blacklisted"
    ])
    .optional(),
  roleRestrictions: csvStringArray,
  eventRestrictions: csvStringArray,
  notes: nullableString,
  internalReviewNotes: nullableString
});

export const burnoutUpsertSchema = z.object({
  id: uuidSchema.optional(),
  volunteerProfileId: uuidSchema,
  flagType: z.enum(["manual", "automatic"]).optional(),
  status: z.enum(["active", "paused", "resolved"]).optional(),
  pauseDays: z.coerce.number().int().min(1).max(3650).optional().nullable(),
  pauseUntil: nullableString,
  reason: nullableString
});

export const incidentUpsertSchema = z.object({
  id: uuidSchema.optional(),
  eventId: nullableString,
  roleId: nullableString,
  assignmentId: nullableString,
  incidentAt: nullableString,
  incidentCategory: z.string().trim().min(1),
  severity: z.enum(["low", "medium", "high", "critical"]),
  description: z.string().trim().min(5),
  witnesses: nullableString,
  actionTaken: nullableString,
  followUpRequired: z.boolean().optional(),
  followUpNotes: nullableString,
  resolved: z.boolean().optional(),
  internalOnly: z.boolean().optional(),
  attachmentUrls: csvStringArray,
  incidentPeople: z
    .array(
      z.object({
        volunteerProfileId: nullableString,
        contactId: nullableString,
        involvementType: z.enum(["subject", "witness", "reporter", "other"]).optional(),
        notes: nullableString
      })
    )
    .optional()
});

export const hourImportStageSchema = z.object({
  eventId: uuidSchema,
  sourceFilename: z.string().trim().min(1),
  columnMapping: z.object({
    volunteerNameColumn: z.string().trim().optional(),
    contactIdentifierColumn: z.string().trim().optional(),
    roleColumn: z.string().trim().optional(),
    dateColumn: z.string().trim().optional(),
    checkInColumn: z.string().trim().optional(),
    checkOutColumn: z.string().trim().optional(),
    hoursColumn: z.string().trim().optional(),
    attendanceStatusColumn: z.string().trim().optional(),
    notesColumn: z.string().trim().optional(),
    contactMatchField: z.enum(["email", "phone", "external_source_id"]).optional()
  }),
  rows: z.array(z.record(z.string(), z.unknown())).min(1)
});

export const hourImportRowUpdateSchema = z.object({
  rowId: uuidSchema,
  matchedContactId: nullableString,
  matchedVolunteerProfileId: nullableString,
  stageStatus: z.enum(["pending", "matched", "unmatched", "error", "skipped", "committed"]).optional(),
  errorMessage: nullableString
});

export const hourImportCommitSchema = z.object({
  importId: uuidSchema
});

