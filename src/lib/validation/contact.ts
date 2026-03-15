import { z } from "zod";

export const entityTypeOptions = ["person", "organization"] as const;
export const trackingStatusOptions = ["donor", "lead", "non_lead"] as const;

export const contactSchema = z
  .object({
    first_name: z.string().min(1, "First name is required"),
    last_name: z.string().min(1, "Last name is required"),
    preferred_name: z.string().optional(),
    formal_letter_name: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    alternate_email: z.string().email().optional().or(z.literal("")),
    phone: z.string().optional(),
    mobile_number: z.string().optional(),
    alternate_phone: z.string().optional(),
    emergency_contact: z.string().optional(),
    emergency_contact_phone: z.string().optional(),
    communication_preferences: z
      .array(z.enum(["Marketing Email", "Other Mail", "Phone Calls", "Newsletter"]))
      .default([]),
    address_line_1: z.string().optional(),
    address_line_2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    postal_code: z.string().optional(),
    mailing_address_line_1: z.string().optional(),
    mailing_address_line_2: z.string().optional(),
    mailing_city: z.string().optional(),
    mailing_state: z.string().optional(),
    mailing_postal_code: z.string().optional(),
    organization_name: z.string().optional(),
    entity_type: z.enum(entityTypeOptions),
    tracking_status: z.enum(trackingStatusOptions),
    webconnex_id: z.string().optional(),
    donor_status: z.enum(["prospect", "active", "lapsed", "inactive"]).optional(),
    member_status: z.enum(["none", "active", "lapsed", "cancelled"]).optional()
  })
  .superRefine((value, ctx) => {
    if (value.entity_type === "organization" && !value.organization_name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Organization Name is required when Record Type is Organization.",
        path: ["organization_name"]
      });
    }

    if (value.entity_type === "person" && value.organization_name?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Organization Name must be blank when Record Type is Person.",
        path: ["organization_name"]
      });
    }

    if (value.webconnex_id?.trim() && value.tracking_status !== "donor") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Records with a GivingFuel ID must have Tracking Status set to Donor.",
        path: ["tracking_status"]
      });
    }
    if (value.webconnex_id?.trim() && value.entity_type !== "person") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Records with a GivingFuel ID must have Record Type set to Person.",
        path: ["entity_type"]
      });
    }
  });

export type ContactInput = z.input<typeof contactSchema>;
