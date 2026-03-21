import { sanitizeInternalKey } from "@/lib/import-center/field-mapping-engine";
import { resolveImportCenterExecution } from "@/lib/import-center/execution-context";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

type CustomFieldDataType = "text" | "number" | "date" | "boolean" | "json";

export async function listContactCustomFields() {
  const { context, supabase } = await resolveImportCenterExecution();

  const { data, error } = await supabase
    .from("contact_custom_fields")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("module", "contacts")
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function createContactCustomField(input: {
  label: string;
  internalKey?: string;
  dataType?: CustomFieldDataType;
}) {
  const { context, supabase } = await resolveImportCenterExecution();

  const dataType = input.dataType ?? "text";
  const label = toText(input.label) || "New Field";
  const internalKey = sanitizeInternalKey(input.internalKey || label);

  const { data: maxRow, error: maxError } = await supabase
    .from("contact_custom_fields")
    .select("display_order")
    .eq("organization_id", context.organizationId)
    .eq("module", "contacts")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxError) throw maxError;
  const nextDisplayOrder = Number(maxRow?.display_order ?? 0) + 1;

  const { data: existing } = await supabase
    .from("contact_custom_fields")
    .select("*")
    .eq("organization_id", context.organizationId)
    .eq("module", "contacts")
    .eq("internal_key", internalKey)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("contact_custom_fields")
    .insert({
      organization_id: context.organizationId,
      module: "contacts",
      field_label: label,
      internal_key: internalKey,
      data_type: dataType,
      display_order: nextDisplayOrder,
      is_active: true,
      created_by: context.userId
    })
    .select("*")
    .single();
  if (error) throw error;

  return data;
}
