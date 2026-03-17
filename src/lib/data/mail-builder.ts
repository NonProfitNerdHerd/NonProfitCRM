import { createClient } from "@/lib/supabase/server";
import { requireAnyStaffPermission, requireStaffPermission } from "@/lib/auth/guards";

type ContactSegment = "persons" | "organizations" | "all";
type ActivityType = "all" | "transactions";

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

export type MailBuilderTemplateInput = {
  id?: string;
  name: string;
  paperSize: "letter" | "a4" | "label_4x6";
  templateBody: string;
  isActive?: boolean;
};

export async function listMailBuilderTemplates() {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mail_builder_templates")
    .select("id,name,paper_size,template_body,is_active,created_at,updated_at")
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
      .select("id,name,paper_size,template_body,is_active,created_at,updated_at")
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
    .select("id,name,paper_size,template_body,is_active,created_at,updated_at")
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

type MailBuilderPreviewFilter = {
  segment: ContactSegment;
  activityType: ActivityType;
  transactionsFrom?: string | null;
  transactionsTo?: string | null;
  tagId?: string | null;
};

export async function getMailBuilderPreview(input: MailBuilderPreviewFilter) {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();

  const segment = input.segment;
  const activityType = input.activityType;
  const dateFrom = parseDate(input.transactionsFrom);
  const dateTo = parseDate(input.transactionsTo);
  const normalizedTagId = toText(input.tagId);

  const enrichedContactSelect =
    "id,first_name,last_name,preferred_name,organization_name,email,phone,entity_type,tracking_status,address_line_1,address_line_2,city,state,postal_code,mailing_address_line_1,mailing_address_line_2,mailing_city,mailing_state,mailing_postal_code";
  const legacyContactSelect =
    "id,first_name,last_name,preferred_name,organization_name,email,phone,entity_type,tracking_status,address_line_1,address_line_2,city,state,postal_code";

  let contactQuery = supabase
    .from("contacts_safe_view")
    .select(enrichedContactSelect)
    .eq("organization_id", context.organizationId)
    .order("last_name", { ascending: true })
    .limit(50000);

  if (segment === "persons") {
    contactQuery = contactQuery.eq("entity_type", "person");
  } else if (segment === "organizations") {
    contactQuery = contactQuery.eq("entity_type", "organization");
  }

  const contactResult = await contactQuery;
  let contacts = (contactResult.data ?? null) as Array<Record<string, unknown>> | null;
  let contactsError = contactResult.error;
  if (contactsError && isMissingMailingColumnError(contactsError)) {
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
  const contactIds = contactRows.map((row) => toText(row.id)).filter(Boolean);
  if (contactIds.length === 0) {
    return { recipients: [], totalCount: 0 };
  }

  let tagFilteredIds = new Set(contactIds);
  if (normalizedTagId) {
    const { data: descendantTagIdsRaw, error: descendantError } = await supabase.rpc(
      "collect_descendant_tag_ids",
      {
        org_id: context.organizationId,
        input_tag_ids: [normalizedTagId]
      }
    );
    if (descendantError) throw descendantError;
    const descendantTagIds = Array.from(
      new Set(
        ((Array.isArray(descendantTagIdsRaw) ? descendantTagIdsRaw : []) as unknown[])
          .map((value) => toText(value))
          .filter(Boolean)
      )
    );
    const tagIds = descendantTagIds.length > 0 ? descendantTagIds : [normalizedTagId];
    const { data: taggedContacts, error: taggedError } = await supabase
      .from("contact_tags")
      .select("contact_id")
      .eq("organization_id", context.organizationId)
      .in("contact_id", contactIds)
      .in("tag_id", tagIds);
    if (taggedError) throw taggedError;
    tagFilteredIds = new Set((taggedContacts ?? []).map((row) => toText(row.contact_id)).filter(Boolean));
  }

  const filteredContactsByTag = contactRows.filter((row) => tagFilteredIds.has(toText(row.id)));
  const filteredContactIds = filteredContactsByTag.map((row) => toText(row.id)).filter(Boolean);
  if (filteredContactIds.length === 0) {
    return { recipients: [], totalCount: 0 };
  }

  let transactionRows: Array<Record<string, unknown>> = [];
  let transactionRollup = new Map<string, { count: number; total: number; lastDate: string }>();
  if (activityType === "transactions") {
    const filteredContactSet = new Set(filteredContactIds);
    let donationQuery = supabase
      .from("donations")
      .select("contact_id,amount,donation_date")
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
      const contactId = toText(donation.contact_id);
      if (!contactId) continue;
      if (!filteredContactSet.has(contactId)) continue;
      const current = transactionRollup.get(contactId) ?? { count: 0, total: 0, lastDate: "" };
      current.count += 1;
      current.total += toNumber(donation.amount);
      const date = toText(donation.donation_date);
      if (!current.lastDate || date > current.lastDate) current.lastDate = date;
      transactionRollup.set(contactId, current);
    }
  }

  const recipientRows = filteredContactsByTag
    .filter((row) => {
      if (activityType !== "transactions") return true;
      return transactionRollup.has(toText(row.id));
    })
    .map((row) => {
      const contactId = toText(row.id);
      const rollup = transactionRollup.get(contactId) ?? { count: 0, total: 0, lastDate: "" };
      const entityType = normalizeLower(row.entity_type) === "organization" ? "organization" : "person";
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
      tagId: normalizedTagId || null
    }
  };
}
