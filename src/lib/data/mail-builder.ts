import { createClient } from "@/lib/supabase/server";
import { requireAnyStaffPermission, requireStaffPermission } from "@/lib/auth/guards";

type ContactSegment = "donors" | "donor_organizations" | "all";
type ActivityType = "all" | "transactions";
type LetterPaperSize = "letter" | "legal" | "tabloid" | "a4" | "a5";
type MailerType = "label" | "envelope";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLower(value: unknown) {
  return toText(value).toLowerCase();
}

function parseDate(value: unknown) {
  const text = toText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function inferredEntityType(row: Record<string, unknown>) {
  const explicit = normalizeLower(row.entity_type);
  if (explicit === "person" || explicit === "organization") return explicit;
  return toText(row.organization_name) ? "organization" : "person";
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const withMessage = error as { message?: unknown; details?: unknown; hint?: unknown };
    const message = toText(withMessage.message);
    const details = toText(withMessage.details);
    const hint = toText(withMessage.hint);
    return [message, details, hint].filter(Boolean).join(" | ") || fallback;
  }
  return fallback;
}

function isMissingMailingColumnError(error: unknown) {
  const message = errorMessage(error, "").toLowerCase();
  return (
    message.includes("mailing_address_line_1") ||
    message.includes("mailing_address_line_2") ||
    message.includes("mailing_city") ||
    message.includes("mailing_state") ||
    message.includes("mailing_postal_code")
  );
}

function isClassificationSchemaMissingError(error: unknown) {
  const message = errorMessage(error, "").toLowerCase();
  return (
    message.includes("tracking_status") ||
    message.includes("donor_status") ||
    message.includes("entity_type")
  );
}

export type MailBuilderTemplateInput = {
  id?: string;
  name: string;
  paperSize: LetterPaperSize;
  templateBody: string;
  isActive?: boolean;
  marginTopIn?: number;
  marginLeftIn?: number;
  marginRightIn?: number;
  marginBottomIn?: number;
  includeMailer?: boolean;
  mailerType?: MailerType;
  mailerSizeKey?: string | null;
  labelMarginTopIn?: number;
  labelMarginLeftIn?: number;
  labelMarginRightIn?: number;
  labelMarginBottomIn?: number;
};

export async function listMailBuilderTemplates() {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mail_builder_templates")
    .select(
      "id,name,paper_size,template_body,is_active,margin_top_in,margin_left_in,margin_right_in,margin_bottom_in,include_mailer,mailer_type,mailer_size_key,label_margin_top_in,label_margin_left_in,label_margin_right_in,label_margin_bottom_in,created_at,updated_at"
    )
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function saveMailBuilderTemplate(input: MailBuilderTemplateInput) {
  const context = await requireAnyStaffPermission(["can_build_reports", "can_edit_contacts"]);
  const supabase = await createClient();
  const payload = {
    organization_id: context.organizationId,
    name: toText(input.name),
    paper_size: input.paperSize,
    template_body: toText(input.templateBody),
    is_active: input.isActive !== false,
    margin_top_in: Number(input.marginTopIn ?? 0.5),
    margin_left_in: Number(input.marginLeftIn ?? 0.5),
    margin_right_in: Number(input.marginRightIn ?? 0.5),
    margin_bottom_in: Number(input.marginBottomIn ?? 0.5),
    include_mailer: Boolean(input.includeMailer),
    mailer_type: input.mailerType ?? "label",
    mailer_size_key: toText(input.mailerSizeKey) || null,
    label_margin_top_in: Number(input.labelMarginTopIn ?? 0),
    label_margin_left_in: Number(input.labelMarginLeftIn ?? 0),
    label_margin_right_in: Number(input.labelMarginRightIn ?? 0),
    label_margin_bottom_in: Number(input.labelMarginBottomIn ?? 0),
    updated_by: context.userId
  };

  if (!payload.name) {
    throw new Error("Template name is required.");
  }
  if (!payload.template_body) {
    throw new Error("Template body is required.");
  }

  if (toText(input.id)) {
    const { data, error } = await supabase
      .from("mail_builder_templates")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", toText(input.id))
      .select(
        "id,name,paper_size,template_body,is_active,margin_top_in,margin_left_in,margin_right_in,margin_bottom_in,include_mailer,mailer_type,mailer_size_key,label_margin_top_in,label_margin_left_in,label_margin_right_in,label_margin_bottom_in,created_at,updated_at"
      )
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("mail_builder_templates")
    .insert({
      ...payload,
      created_by: context.userId
    })
    .select(
      "id,name,paper_size,template_body,is_active,margin_top_in,margin_left_in,margin_right_in,margin_bottom_in,include_mailer,mailer_type,mailer_size_key,label_margin_top_in,label_margin_left_in,label_margin_right_in,label_margin_bottom_in,created_at,updated_at"
    )
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMailBuilderTemplate(templateId: string) {
  const context = await requireAnyStaffPermission(["can_build_reports", "can_edit_contacts"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("mail_builder_templates")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", templateId);
  if (error) throw error;
}

export async function listMailBuilderCampaignOptions() {
  const context = await requireAnyStaffPermission(["can_view_contacts", "can_view_donations"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id,name,status")
    .eq("organization_id", context.organizationId)
    .order("name", { ascending: true })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: toText(row.id),
    name: toText(row.name),
    status: toText(row.status)
  }));
}

type MailBuilderPreviewFilter = {
  segment: ContactSegment;
  activityType: ActivityType;
  transactionsFrom?: string | null;
  transactionsTo?: string | null;
  campaignId?: string | null;
};

export async function getMailBuilderPreview(input: MailBuilderPreviewFilter) {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const segment = input.segment;
  const activityType = input.activityType;
  const dateFrom = parseDate(input.transactionsFrom);
  const dateTo = parseDate(input.transactionsTo);
  const normalizedCampaignId = toText(input.campaignId);

  const enrichedContactSelect =
    "id,first_name,last_name,preferred_name,organization_name,email,phone,entity_type,tracking_status,donor_status,address_line_1,address_line_2,city,state,postal_code,mailing_address_line_1,mailing_address_line_2,mailing_city,mailing_state,mailing_postal_code";
  const legacyContactSelect =
    "id,first_name,last_name,preferred_name,organization_name,email,phone,entity_type,tracking_status,donor_status,address_line_1,address_line_2,city,state,postal_code";

  let contactQuery = supabase
    .from("contacts_safe_view")
    .select(enrichedContactSelect)
    .eq("organization_id", context.organizationId)
    .order("last_name", { ascending: true })
    .limit(50000);

  if (segment === "donors") {
    contactQuery = contactQuery.eq("entity_type", "person");
  } else if (segment === "donor_organizations") {
    contactQuery = contactQuery.eq("entity_type", "organization");
  }

  const contactResult = await contactQuery;
  let contacts = (contactResult.data ?? null) as Array<Record<string, unknown>> | null;
  let contactsError = contactResult.error;
  if (
    contactsError &&
    (isMissingMailingColumnError(contactsError) || isClassificationSchemaMissingError(contactsError))
  ) {
    const fallbackResult = await supabase
      .from("contacts_safe_view")
      .select(legacyContactSelect)
      .eq("organization_id", context.organizationId)
      .order("last_name", { ascending: true })
      .limit(50000);
    contacts = (fallbackResult.data ?? null) as Array<Record<string, unknown>> | null;
    contactsError = fallbackResult.error;
  }
  if (contactsError) {
    throw new Error(errorMessage(contactsError, "Unable to load contacts for mail builder."));
  }

  const contactRows = (contacts ?? []) as Array<Record<string, unknown>>;
  const normalizedContactRows = contactRows.filter((row) => {
    const entityType = inferredEntityType(row);
    const trackingStatus = normalizeLower(row.tracking_status);
    const donorStatus = normalizeLower(row.donor_status);
    const isDonorFlag = trackingStatus === "donor" || donorStatus === "active" || donorStatus === "lapsed";
    const allowByTransactionMode = activityType === "transactions";
    if (segment === "donors") {
      return entityType === "person" && (allowByTransactionMode || isDonorFlag);
    }
    if (segment === "donor_organizations") {
      return entityType === "organization" && (allowByTransactionMode || isDonorFlag);
    }
    if (!allowByTransactionMode) {
      return isDonorFlag && (entityType === "person" || entityType === "organization");
    }
    return entityType === "person" || entityType === "organization";
  });
  const contactIds = normalizedContactRows.map((row) => toText(row.id)).filter(Boolean);
  if (contactIds.length === 0) {
    return { recipients: [], totalCount: 0 };
  }

  let transactionRows: Array<Record<string, unknown>> = [];
  let transactionRollup = new Map<string, { count: number; total: number; lastDate: string }>();
  const campaignDonationIds = new Set<string>();
  if (normalizedCampaignId) {
    let directCampaignQuery = supabase
      .from("donations")
      .select("id")
      .eq("organization_id", context.organizationId)
      .eq("campaign_id", normalizedCampaignId)
      .not("contact_id", "is", null)
      .limit(100000);
    if (dateFrom) directCampaignQuery = directCampaignQuery.gte("donation_date", dateFrom);
    if (dateTo) directCampaignQuery = directCampaignQuery.lte("donation_date", dateTo);
    const { data: directCampaignRows, error: directCampaignError } = await directCampaignQuery;
    if (!directCampaignError) {
      for (const row of directCampaignRows ?? []) {
        const donationId = toText(row.id);
        if (donationId) campaignDonationIds.add(donationId);
      }
    }

    const { data: allocationRows, error: allocationError } = await supabase
      .from("donation_allocations")
      .select("donation_id")
      .eq("organization_id", context.organizationId)
      .eq("campaign_id", normalizedCampaignId)
      .limit(100000);
    if (allocationError) {
      throw new Error(errorMessage(allocationError, "Unable to load donation campaign allocations."));
    }
    for (const row of allocationRows ?? []) {
      const donationId = toText(row.donation_id);
      if (donationId) campaignDonationIds.add(donationId);
    }
  }

  const shouldBuildTransactionRollup = activityType === "transactions" || Boolean(normalizedCampaignId);
  if (shouldBuildTransactionRollup) {
    const filteredContactSet = new Set(contactIds);
    let donationQuery = supabase
      .from("donations")
      .select("id,contact_id,amount,donation_date")
      .eq("organization_id", context.organizationId)
      .not("contact_id", "is", null)
      .limit(100000);
    if (dateFrom) donationQuery = donationQuery.gte("donation_date", dateFrom);
    if (dateTo) donationQuery = donationQuery.lte("donation_date", dateTo);
    const { data: donations, error: donationsError } = await donationQuery;
    if (donationsError) {
      throw new Error(
        errorMessage(
          donationsError,
          "Unable to load transactions for mail builder. Check donations permission and filters."
        )
      );
    }
    transactionRows = (donations ?? []) as Array<Record<string, unknown>>;
    transactionRollup = new Map<string, { count: number; total: number; lastDate: string }>();
    for (const donation of transactionRows) {
      const donationId = toText(donation.id);
      const contactId = toText(donation.contact_id);
      if (!contactId) continue;
      if (!filteredContactSet.has(contactId)) continue;
      if (normalizedCampaignId && (!donationId || !campaignDonationIds.has(donationId))) continue;
      const current = transactionRollup.get(contactId) ?? { count: 0, total: 0, lastDate: "" };
      current.count += 1;
      current.total += toNumber(donation.amount);
      const date = toText(donation.donation_date);
      if (!current.lastDate || date > current.lastDate) current.lastDate = date;
      transactionRollup.set(contactId, current);
    }
  }

  const recipientRows = normalizedContactRows
    .filter((row) => {
      if (!shouldBuildTransactionRollup) return true;
      return transactionRollup.has(toText(row.id));
    })
    .map((row) => {
      const contactId = toText(row.id);
      const rollup = transactionRollup.get(contactId) ?? { count: 0, total: 0, lastDate: "" };
      const entityType = inferredEntityType(row);
      const firstName = toText(row.first_name);
      const lastName = toText(row.last_name);
      const organizationName = toText(row.organization_name);
      const name =
        organizationName ||
        toText(row.preferred_name) ||
        `${firstName} ${lastName}`.trim() ||
        "Unnamed Contact";
      const addressLine1 = toText(row.mailing_address_line_1) || toText(row.address_line_1);
      const addressLine2 = toText(row.mailing_address_line_2) || toText(row.address_line_2);
      const city = toText(row.mailing_city) || toText(row.city);
      const state = toText(row.mailing_state) || toText(row.state);
      const postalCode = toText(row.mailing_postal_code) || toText(row.postal_code);
      return {
        contactId,
        name,
        firstName,
        lastName,
        organizationName,
        entityType,
        trackingStatus: toText(row.tracking_status),
        email: toText(row.email),
        phone: toText(row.phone),
        addressLine1,
        addressLine2,
        city,
        state,
        postalCode,
        transactionCount: rollup.count,
        transactionTotal: Math.round(rollup.total * 100) / 100,
        lastTransactionDate: rollup.lastDate
      };
    });

  return {
    recipients: recipientRows,
    totalCount: recipientRows.length,
    filtersApplied: {
      segment,
      activityType,
      transactionsFrom: dateFrom,
      transactionsTo: dateTo,
      campaignId: normalizedCampaignId || null
    }
  };
}
