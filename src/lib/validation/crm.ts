import { z } from "zod";

export const campaignSchema = z
  .object({
    name: z.string().trim().min(1, "Campaign Name is required."),
    description: z.string().optional(),
    status: z.enum(["Active", "Inactive"]).default("Active"),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })
  .refine(
    (input) => {
      if (!input.startDate || !input.endDate) return true;
      return input.endDate >= input.startDate;
    },
    {
      message: "End Date cannot be before Start Date.",
      path: ["endDate"]
    }
  );

export const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  status: z
    .enum([
      "idea",
      "under_review",
      "approved",
      "planning",
      "active",
      "on_hold",
      "completed",
      "cancelled",
      "archived"
    ])
    .optional(),
  lifecycleStatus: z
    .enum([
      "idea",
      "under_review",
      "approved",
      "planning",
      "active",
      "on_hold",
      "completed",
      "cancelled",
      "archived"
    ])
    .default("idea"),
  projectStartDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  projectManagerUserId: z.string().uuid().optional(),
  ownerUserId: z.string().uuid().optional(),
  problemStatement: z.string().optional(),
  businessJustification: z.string().optional(),
  expectedOutcomes: z.string().optional(),
  successCriteria: z.string().optional(),
  roughCostEstimate: z.coerce.number().nonnegative().optional(),
  roughTimeEstimateWeeks: z.coerce.number().nonnegative().optional(),
  strategicAlignment: z.string().optional(),
  requestorName: z.string().optional(),
  executiveSponsorName: z.string().optional(),
  scoreImpact: z.coerce.number().int().min(1).max(5).optional(),
  scoreEffort: z.coerce.number().int().min(1).max(5).optional(),
  scoreRisk: z.coerce.number().int().min(1).max(5).optional(),
  assignedStaff: z
    .array(
      z.object({
        userId: z.string().uuid(),
        roleOnProject: z.string().min(1)
      })
    )
    .optional()
    .default([]),
  stakeholders: z
    .array(
      z.object({
        stakeholderName: z.string().min(1),
        stakeholderRoleTitle: z.string().optional(),
        organization: z.string().optional(),
        stakeholderType: z.enum(["Internal", "External"]).default("External"),
        influenceLevel: z.string().optional(),
        interestLevel: z.string().optional(),
        supportLevel: z.string().optional(),
        engagementStrategy: z.string().optional(),
        communicationNeeds: z.string().optional(),
        ownerUserId: z.string().uuid().optional(),
        contactInfo: z.string().optional()
      })
    )
    .optional()
    .default([])
});

export const projectStaffSchema = z.object({
  userId: z.string().uuid(),
  roleOnProject: z.string().min(1)
});

export const projectStakeholderSchema = z.object({
  stakeholderName: z.string().min(1),
  stakeholderRoleTitle: z.string().optional(),
  organization: z.string().optional(),
  stakeholderType: z.enum(["Internal", "External"]).default("External"),
  influenceLevel: z.string().optional(),
  interestLevel: z.string().optional(),
  supportLevel: z.string().optional(),
  engagementStrategy: z.string().optional(),
  communicationNeeds: z.string().optional(),
  ownerUserId: z.string().uuid().optional(),
  contactInfo: z.string().optional()
});

export const membershipTypeSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  membershipLength: z.coerce.number().int().positive(),
  lengthUnit: z.enum(["days", "months", "years"]),
  status: z.enum(["active", "inactive"]).default("active")
});

export const taskUpdateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["todo", "in_progress", "completed", "blocked", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  suspenseDate: z.string().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  ownerUserId: z.string().uuid().optional(),
  estimatedHours: z.coerce.number().nonnegative().optional(),
  actualHours: z.coerce.number().nonnegative().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  percentComplete: z.coerce.number().int().min(0).max(100).optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  blockingNote: z.string().optional()
});

export const taskCommentSchema = z.object({
  commentBody: z.string().min(1)
});
