import { z } from "zod";

export const portalProfileSchema = z.object({
  preferred_name: z.string().max(120).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional(),
  contact_by_email: z.boolean().default(true),
  contact_by_sms: z.boolean().default(false)
});

export type PortalProfileInput = z.infer<typeof portalProfileSchema>;
