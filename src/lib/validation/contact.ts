import { z } from "zod";

export const contactSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  preferred_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  alternate_email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  alternate_phone: z.string().optional(),
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
  donor_status: z.enum(["prospect", "active", "lapsed", "inactive"]),
  member_status: z.enum(["none", "active", "lapsed", "cancelled"])
});

export type ContactInput = z.infer<typeof contactSchema>;
