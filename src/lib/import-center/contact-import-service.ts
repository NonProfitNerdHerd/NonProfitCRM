import { createClient } from "@/lib/supabase/server";
import { requireImportCenterAccess } from "@/lib/auth/guards";
import {
  mapRowToTargets,
  mappingSummary,
  sanitizeInternalKey
} from "@/lib/import-center/field-mapping-engine";
import { appendImportCenterRowError, logImportCenterAudit } from "@/lib/import-center/logging-service";
import { ensureContactTags, parseTagsFromCell } from "@/lib/import-center/tag-parser-service";
import { createContactCustomField, listContactCustomFields } from "@/lib/import-center/custom-fields-service";
import { detectInFileDuplicateWarnings, validateContactImportPayload } from "@/lib/import-center/validation-engine";
import {
  CONTACT_STANDARD_FIELDS,
  type ContactClassificationInput,
  type ContactImportRunInput,
  type ImportCenterMapping
} from "@/lib/import-center/types";
import { listImportCenterTemplates } from "@/lib/import-center/template-service";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown) {
  return toText(value).replace(/\D+/g, "");
}

function donorStatusForCategory(category: ContactClassificationInput["contactCategory"]) {
  if (category === "donor") return "active";
  if (category === "non_lead") return "inactive";
  return "prospect";
}

async function resolveContactDuplicate(input: {
  organizationId: string;
  row: Record<string, unknown>;
  standard: Record<string, unknown>;
  mappings: ImportCenterMapping[];
}) {
  const supabase = await createClient();
  const externalId = toText(input.standard.external_source_id).toLowerCase();
  if (externalId) {
    const { data: externalMatch } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("external_source", "import_center")
      .ilike("external_source_id", externalId)
      .maybeSingle();
    if (externalMatch?.id) {
      return { duplicate: false, existingId: String(externalMatch.id), byExternalId: true };
    }
  }

  const emailMapping = input.mappings.find(
    (mapping) => mapping.targetType === "standard" && mapping.targetKey === "email"
  );
  if (emailMapping) {
    const email = toText(input.row[emailMapping.sourceHeader]).toLowerCase();
    if (email) {
      const { data: emailMatch } = await supabase
        .from("contacts")
        .select("id")
        .eq("organization_id", input.organizationId)
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
      if (emailMatch?.id) {
        return { duplicate: true, existingId: String(emailMatch.id), reason: "Duplicate email match" };
      }
    }
  }

  const firstName = toText(input.standard.first_name).toLowerCase();
  const lastName = toText(input.standard.last_name).toLowerCase();
  const phone = normalizePhone(input.standard.phone);
  if (firstName && lastName && phone) {
    const { data: candidates } = await supabase
      .from("contacts")
      .select("id,phone")
      .eq("organization_id", input.organizationId)
      .ilike("first_name", firstName)
      .ilike("last_name", lastName)
      .limit(25);
    const match = (candidates ?? []).find((row) => normalizePhone(row.phone) === phone);
    if (match?.id) {
      return {
        duplicate: true,
        existingId: String(match.id),
        reason: "Duplicate first + last + phone match"
      };
    }
  }

  return { duplicate: false, existingId: null, byExternalId: false };
}

async function ensureCustomFieldIdMap(mappings: ImportCenterMapping[]) {
  const fieldMap = new Map<string, string>();
  const customMappings = mappings.filter((mapping) => mapping.targetType === "custom");
  if (!customMappings.length) return fieldMap;

  const existingFields = await listContactCustomFields();
  for (const field of existingFields) {
    fieldMap.set(String(field.internal_key), String(field.id));
  }

  for (const mapping of customMappings) {
    const targetKey = toText(mapping.targetKey);
    if (!targetKey && !mapping.createField) continue;
    const internalKey = targetKey || sanitizeInternalKey(mapping.createField?.label ?? mapping.sourceHeader);
    if (fieldMap.has(internalKey)) continue;

    const created = await createContactCustomField({
      label: mapping.createField?.label ?? mapping.sourceHeader,
      internalKey,
      dataType: mapping.createField?.dataType ?? "text"
    });
    fieldMap.set(internalKey, String(created.id));
  }

  return fieldMap;
}

export async function listImportCenterJobs(limit = 25) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();
  const safeLimit = Math.min(Math.max(limit, 1), 200);

  const { data, error } = await supabase
    .from("import_center_jobs")
    .select("*")
    .eq("organization_id", context.organizationId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return data ?? [];
}

export async function getImportCenterMetadata() {
  const [templates, customFields, jobs] = await Promise.all([
    listImportCenterTemplates("contacts"),
    listContactCustomFields(),
    listImportCenterJobs(25)
  ]);

  return {
    importTypes: [{ key: "contacts", label: "Contacts Import" }],
    standardFields: CONTACT_STANDARD_FIELDS,
    customFields,
    templates,
    jobs
  };
}

export async function runContactsImport(input: ContactImportRunInput) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const validationErrors = validateContactImportPayload({
    rows: input.rows,
    mappings: input.mappings,
    classification: input.classification
  });
  if (validationErrors.length > 0) {
    throw new Error(validationErrors.join(" "));
  }

  const tagDelimiter = toText(input.tagDelimiter) || ";";
  const duplicateHandling = input.duplicateHandling ?? "skip";

  const { data: job, error: jobError } = await supabase
    .from("import_center_jobs")
    .insert({
      organization_id: context.organizationId,
      import_type: "contacts",
      file_name: input.fileName,
      template_used: input.templateId ?? null,
      uploaded_by: context.userId,
      started_at: new Date().toISOString(),
      status: "running",
      total_rows: input.rows.length,
      mapping_configuration_snapshot: {
        mappings: input.mappings,
        summary: mappingSummary(input.mappings)
      },
      classification_snapshot: input.classification,
      tag_configuration: { delimiter: tagDelimiter },
      duplicate_handling: duplicateHandling
    })
    .select("id")
    .single();
  if (jobError) throw jobError;

  const jobId = String(job.id);
  let successfulRows = 0;
  let failedRows = 0;
  let skippedRows = 0;
  let newTagsCreated = 0;
  const tagCache = new Map<string, string>();
  const createdTagTracker = new Set<string>();
  const customFieldIdMap = await ensureCustomFieldIdMap(input.mappings);

  for (const [index, row] of input.rows.entries()) {
    try {
      const mapped = mapRowToTargets(row, input.mappings);
      const firstName = toText(mapped.standard.first_name);
      const lastName = toText(mapped.standard.last_name);
      if (!firstName || !lastName) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId,
          rowIndex: index + 1,
          errorMessage: "First Name and Last Name are required.",
          rawRow: row
        });
        continue;
      }

      const duplicate = await resolveContactDuplicate({
        organizationId: context.organizationId,
        row,
        standard: mapped.standard,
        mappings: input.mappings
      });
      if (duplicate.duplicate) {
        skippedRows += 1;
        await appendImportCenterRowError({
          organizationId: context.organizationId,
          jobId,
          rowIndex: index + 1,
          errorMessage:
            duplicateHandling === "flag"
              ? `Flagged duplicate: ${duplicate.reason}`
              : `Skipped duplicate: ${duplicate.reason}`,
          rawRow: row
        });
        continue;
      }

      const contactPayload = {
        organization_id: context.organizationId,
        first_name: firstName,
        last_name: lastName,
        preferred_name: toText(mapped.standard.preferred_name) || null,
        organization_name:
          input.classification.contactType === "organization"
            ? toText(mapped.standard.organization_name) || `${firstName} ${lastName}`
            : toText(mapped.standard.organization_name) || null,
        entity_type: input.classification.contactType,
        tracking_status: input.classification.contactCategory,
        donor_status: donorStatusForCategory(input.classification.contactCategory),
        email: toText(mapped.standard.email).toLowerCase() || null,
        alternate_email: toText(mapped.standard.alternate_email).toLowerCase() || null,
        phone: toText(mapped.standard.phone) || null,
        mobile_number: toText(mapped.standard.mobile_number) || null,
        alternate_phone: toText(mapped.standard.alternate_phone) || null,
        address_line_1: toText(mapped.standard.address_line_1) || null,
        address_line_2: toText(mapped.standard.address_line_2) || null,
        city: toText(mapped.standard.city) || null,
        state: toText(mapped.standard.state) || null,
        postal_code: toText(mapped.standard.postal_code) || null,
        mailing_address_line_1: toText(mapped.standard.mailing_address_line_1) || null,
        mailing_address_line_2: toText(mapped.standard.mailing_address_line_2) || null,
        mailing_city: toText(mapped.standard.mailing_city) || null,
        mailing_state: toText(mapped.standard.mailing_state) || null,
        mailing_postal_code: toText(mapped.standard.mailing_postal_code) || null,
        formal_letter_name: toText(mapped.standard.formal_letter_name) || null,
        external_source: "import_center",
        external_source_id: toText(mapped.standard.external_source_id).toLowerCase() || null,
        created_by: context.userId,
        updated_by: context.userId
      };

      let contactId = duplicate.existingId;
      if (contactId && duplicate.byExternalId) {
        const { error: updateError } = await supabase
          .from("contacts")
          .update(contactPayload)
          .eq("organization_id", context.organizationId)
          .eq("id", contactId);
        if (updateError) throw updateError;
      } else {
        const { data: created, error: insertError } = await supabase
          .from("contacts")
          .insert(contactPayload)
          .select("id")
          .single();
        if (insertError) throw insertError;
        contactId = String(created.id);
      }

      for (const [internalKey, rawValue] of Object.entries(mapped.custom)) {
        const fieldId = customFieldIdMap.get(internalKey);
        if (!fieldId) continue;
        const valueText = toText(rawValue);
        if (!valueText) continue;
        const { error: fieldValueError } = await supabase.from("contact_custom_field_values").upsert(
          {
            organization_id: context.organizationId,
            contact_id: contactId,
            custom_field_id: fieldId,
            value_text: valueText,
            value_json: { value: valueText },
            created_by: context.userId
          },
          {
            onConflict: "organization_id,contact_id,custom_field_id"
          }
        );
        if (fieldValueError) throw fieldValueError;
      }

      const tags = parseTagsFromCell(mapped.tagsValue, tagDelimiter);
      if (tags.length > 0) {
        const ensured = await ensureContactTags({
          organizationId: context.organizationId,
          userId: context.userId,
          tagNames: tags,
          cache: tagCache,
          createdTracker: createdTagTracker
        });
        newTagsCreated += ensured.createdCount;

        if (ensured.tagIds.length > 0) {
          const rows = ensured.tagIds.map((tagId) => ({
            organization_id: context.organizationId,
            contact_id: contactId,
            tag_id: tagId,
            assigned_by: context.userId,
            assignment_source: "import" as const
          }));
          const { error: tagAssignError } = await supabase.from("contact_tags").upsert(rows, {
            onConflict: "organization_id,contact_id,tag_id",
            ignoreDuplicates: true
          });
          if (tagAssignError) throw tagAssignError;
        }
      }

      successfulRows += 1;
    } catch (error) {
      failedRows += 1;
      await appendImportCenterRowError({
        organizationId: context.organizationId,
        jobId,
        rowIndex: index + 1,
        errorMessage:
          error instanceof Error ? error.message : "Unexpected error while importing contact row.",
        rawRow: row
      });
    }
  }

  const status = failedRows > 0 ? "completed_with_errors" : "completed";
  const { error: finalizeError } = await supabase
    .from("import_center_jobs")
    .update({
      status,
      successful_rows: successfulRows,
      failed_rows: failedRows,
      skipped_rows: skippedRows,
      new_tags_created: newTagsCreated,
      completed_at: new Date().toISOString(),
      error_log_location: failedRows + skippedRows > 0 ? `import_center_job_errors:${jobId}` : null
    })
    .eq("organization_id", context.organizationId)
    .eq("id", jobId);
  if (finalizeError) throw finalizeError;

  const duplicatePreview = detectInFileDuplicateWarnings({
    rows: input.rows,
    mappings: input.mappings
  });

  await logImportCenterAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    actionType: "import_center_contacts_run",
    targetEntityType: "import_center_jobs",
    targetEntityId: jobId,
    metadata: {
      totalRows: input.rows.length,
      successfulRows,
      failedRows,
      skippedRows,
      newTagsCreated,
      duplicatePreview
    }
  });

  return {
    jobId,
    totalRows: input.rows.length,
    successfulRows,
    failedRows,
    skippedRows,
    newTagsCreated,
    duplicatePreview
  };
}

export async function listImportCenterJobErrors(jobId: string) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("import_center_job_errors")
    .select("row_index,error_message,raw_row")
    .eq("organization_id", context.organizationId)
    .eq("import_center_job_id", jobId)
    .order("row_index", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
