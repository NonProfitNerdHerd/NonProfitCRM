import { z } from "zod";

export const contactSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  preferred_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  organization_name: z.string().optional(),
  donor_status: z.enum(["prospect", "active", "lapsed", "inactive"]),
  member_status: z.enum(["none", "active", "lapsed", "cancelled"]),
  contains_pii: z.boolean().optional().default(true)
});

export type ContactInput = z.infer<typeof contactSchema>;
