import { z } from "zod";

export const donationSchema = z
  .object({
    contactId: z.string().uuid(),
    crmOrganizationId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
    date: z.string().min(1),
    totalAmount: z.coerce.number().positive().optional(),
    amount: z.coerce.number().positive().optional(),
    campaignId: z.string().uuid().optional(),
    allocations: z
      .array(
        z.object({
          campaignId: z.string().uuid(),
          amount: z.coerce.number().positive()
        })
      )
      .optional(),
    paymentType: z.enum(["Cash", "Check", "Card"]),
    checkNumber: z.string().optional(),
    transactionId: z.string().optional(),
    memo: z.string().optional(),
    sourceSystem: z.string().optional(),
    externalDonationId: z.string().optional(),
    recurring: z.boolean().optional()
  })
  .superRefine((value, ctx) => {
    if (
      value.crmOrganizationId &&
      value.organizationId &&
      value.crmOrganizationId !== value.organizationId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["crmOrganizationId"],
        message: "CRM Organization ID and Organization ID must match when both are provided."
      });
    }

    const totalAmount = value.totalAmount ?? value.amount;
    if (totalAmount === undefined || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalAmount"],
        message: "Total Donation Amount is required."
      });
    }

    const allocations =
      value.allocations && value.allocations.length > 0
        ? value.allocations
        : value.campaignId && totalAmount
          ? [{ campaignId: value.campaignId, amount: totalAmount }]
          : [];

    if (allocations.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["allocations"],
        message: "At least one campaign allocation is required."
      });
    }

    const seenCampaigns = new Set<string>();
    for (const [index, allocation] of allocations.entries()) {
      if (seenCampaigns.has(allocation.campaignId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allocations", index, "campaignId"],
          message: "Each campaign can only appear once in a split donation."
        });
      }
      seenCampaigns.add(allocation.campaignId);
      if (!Number.isFinite(allocation.amount) || allocation.amount <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allocations", index, "amount"],
          message: "Allocation amount must be greater than zero."
        });
      }
    }

    if (totalAmount) {
      const allocated = allocations.reduce((sum, allocation) => sum + Number(allocation.amount || 0), 0);
      if (Math.abs(allocated - totalAmount) > 0.009) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allocations"],
          message: "Split allocations must exactly match the Total Donation Amount."
        });
      }
    }

    if (value.paymentType === "Check" && !value.checkNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkNumber"],
        message: "Check number is required for check payments."
      });
    }
    if (value.paymentType === "Card" && !value.transactionId?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["transactionId"],
        message: "Transaction ID is required for card payments."
      });
    }
  });

export const noteSchema = z
  .object({
    contactId: z.string().uuid(),
    body: z.string().min(1, "Note content is required"),
    followUpRequired: z.boolean().default(false),
    followUpTaskType: z.enum(["Call", "Email", "Mail", "Other"]).optional(),
    followUpAssignedToUserId: z.string().uuid().optional(),
    followUpSuspenseDate: z.string().optional(),
    followUpTaskDescription: z.string().optional()
  })
  .superRefine((value, ctx) => {
    if (!value.followUpRequired) return;

    if (!value.followUpAssignedToUserId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["followUpAssignedToUserId"],
        message: "Assigned staff member is required when follow-up is enabled."
      });
    }

    if (!value.followUpSuspenseDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["followUpSuspenseDate"],
        message: "Suspense date is required when follow-up is enabled."
      });
    }

    if (!value.followUpTaskDescription?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["followUpTaskDescription"],
        message: "Task description is required when follow-up is enabled."
      });
    }

    if (!value.followUpTaskType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["followUpTaskType"],
        message: "Task type is required when follow-up is enabled."
      });
    }
  });
