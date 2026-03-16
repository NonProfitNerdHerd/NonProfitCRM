import { createClient } from "@/lib/supabase/server";
import { requireImportCenterAccess } from "@/lib/auth/guards";
import { logImportCenterAudit } from "@/lib/import-center/logging-service";
import type {
  ImportCenterType,
  ImportTemplatePayload,
  ReimportMatchSettings
} from "@/lib/import-center/types";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toRerunSettings(
  input?: ReimportMatchSettings
): Required<ReimportMatchSettings> {
  return {
    enabled: Boolean(input?.enabled),
    sourceMatchColumn: toText(input?.sourceMatchColumn) || null,
    destinationMatchField: toText(input?.destinationMatchField) || null,
    onMatchBehavior: input?.onMatchBehavior ?? "update_blank_only",
    onNoMatchBehavior: input?.onNoMatchBehavior ?? "create_new",
    ignoreBlankOverwrites: true,
    missingKeyBehavior: input?.missingKeyBehavior ?? "skip_row"
  };
}

export async function listImportCenterTemplates(importType: ImportCenterType = "contacts") {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("import_center_templates")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("import_type", importType)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createImportCenterTemplate(payload: ImportTemplatePayload) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const rerun = toRerunSettings(payload.rerunMatching);
  const { data, error } = await supabase
    .from("import_center_templates")
    .insert({
      organization_id: context.organizationId,
      import_type: payload.importType,
      name: toText(payload.name) || "Untitled Template",
      mapping_configuration: payload.mappings,
      classification_defaults: payload.classification,
      tag_configuration: { delimiter: payload.tagDelimiter ?? null },
      duplicate_handling: payload.duplicateHandling ?? "skip",
      rerun_matching_enabled: rerun.enabled,
      source_match_column: rerun.sourceMatchColumn,
      destination_match_field: rerun.destinationMatchField,
      on_match_behavior: rerun.onMatchBehavior,
      on_no_match_behavior: rerun.onNoMatchBehavior,
      ignore_blank_overwrites: true,
      missing_key_behavior: rerun.missingKeyBehavior,
      is_active: true,
      created_by: context.userId
    })
    .select("*")
    .single();
  if (error) throw error;

  await logImportCenterAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    actionType: "import_center_template_created",
    targetEntityType: "import_center_templates",
    targetEntityId: String(data.id),
    metadata: { importType: payload.importType, name: payload.name }
  });

  return data;
}

export async function updateImportCenterTemplate(
  templateId: string,
  payload: Partial<ImportTemplatePayload> & { isActive?: boolean }
) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const rerun = toRerunSettings(payload.rerunMatching);
  const updates: Record<string, unknown> = {};
  if (payload.name !== undefined) updates.name = toText(payload.name) || "Untitled Template";
  if (payload.mappings !== undefined) updates.mapping_configuration = payload.mappings;
  if (payload.classification !== undefined) updates.classification_defaults = payload.classification;
  if (payload.tagDelimiter !== undefined) {
    updates.tag_configuration = { delimiter: payload.tagDelimiter ?? null };
  }
  if (payload.duplicateHandling !== undefined) updates.duplicate_handling = payload.duplicateHandling;
  if (payload.rerunMatching !== undefined) {
    updates.rerun_matching_enabled = rerun.enabled;
    updates.source_match_column = rerun.sourceMatchColumn;
    updates.destination_match_field = rerun.destinationMatchField;
    updates.on_match_behavior = rerun.onMatchBehavior;
    updates.on_no_match_behavior = rerun.onNoMatchBehavior;
    updates.ignore_blank_overwrites = true;
    updates.missing_key_behavior = rerun.missingKeyBehavior;
  }
  if (payload.isActive !== undefined) updates.is_active = payload.isActive;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("import_center_templates")
    .update(updates)
    .eq("organization_id", context.organizationId)
    .eq("id", templateId)
    .select("*")
    .single();
  if (error) throw error;

  await logImportCenterAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    actionType: "import_center_template_updated",
    targetEntityType: "import_center_templates",
    targetEntityId: templateId
  });

  return data;
}

export async function cloneImportCenterTemplate(templateId: string) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("import_center_templates")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("id", templateId)
    .single();
  if (sourceError) throw sourceError;

  const { data, error } = await supabase
    .from("import_center_templates")
    .insert({
      organization_id: context.organizationId,
      import_type: source.import_type,
      name: `${String(source.name)} (Copy)`,
      mapping_configuration: source.mapping_configuration,
      classification_defaults: source.classification_defaults,
      tag_configuration: source.tag_configuration,
      duplicate_handling: source.duplicate_handling,
      rerun_matching_enabled: source.rerun_matching_enabled,
      source_match_column: source.source_match_column,
      destination_match_field: source.destination_match_field,
      on_match_behavior: source.on_match_behavior,
      on_no_match_behavior: source.on_no_match_behavior,
      ignore_blank_overwrites: source.ignore_blank_overwrites,
      missing_key_behavior: source.missing_key_behavior,
      is_active: source.is_active,
      created_by: context.userId
    })
    .select("*")
    .single();
  if (error) throw error;

  await logImportCenterAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    actionType: "import_center_template_cloned",
    targetEntityType: "import_center_templates",
    targetEntityId: String(data.id),
    metadata: { sourceTemplateId: templateId }
  });

  return data;
}

export async function deleteImportCenterTemplate(templateId: string) {
  const context = await requireImportCenterAccess();
  const supabase = await createClient();

  const { error } = await supabase
    .from("import_center_templates")
    .delete()
    .eq("organization_id", context.organizationId)
    .eq("id", templateId);
  if (error) throw error;

  await logImportCenterAudit({
    organizationId: context.organizationId,
    userId: context.userId,
    actionType: "import_center_template_deleted",
    targetEntityType: "import_center_templates",
    targetEntityId: templateId
  });

  return { ok: true };
}
