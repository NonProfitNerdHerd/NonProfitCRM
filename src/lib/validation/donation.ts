import { z } from "zod";

export const donationSchema = z
  .object({
    contactId: z.string().uuid(),
    campaignId: z.string().uuid(),
    date: z.string().min(1),
    amount: z.coerce.number().positive(),
    paymentType: z.enum(["Cash", "Check", "Card"]),
    checkNumber: z.string().optional(),
    transactionId: z.string().optional(),
    memo: z.string().optional()
  })
  .superRefine((value, ctx) => {
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
  });
