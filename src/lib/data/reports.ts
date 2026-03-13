import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";
import { PermissionKey, VisibilityClassification } from "@/types/database";

export type ReportDomain =
  | "contacts"
  | "donations"
  | "memberships"
  | "notes"
  | "tasks"
  | "communications";

type ReportFilter = { field: string; operator: "eq" | "ilike"; value: string };
type ReportSort = { field: string; direction: "asc" | "desc" };

type AuthorizedField = {
  field_key: string;
  label: string;
  source_column: string | null;
  source_expression: string | null;
  required_permission_key: string | null;
  is_pii: boolean;
  is_exportable: boolean;
  visibility_classification: VisibilityClassification | null;
};

const domainSource: Record<ReportDomain, string> = {
  contacts: "contacts_safe_view",
  donations: "donations",
  memberships: "memberships",
  notes: "notes_safe_view",
  tasks: "tasks_safe_view",
  communications: "communication_log"
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function getAuthorizedReportFields(domain: ReportDomain) {
  const context = await requireStaffPermission("can_run_reports");
  const supabase = await createClient();

  const { data: fields, error } = await supabase
    .from("report_fields")
    .select(
      "field_key,label,source_column,source_expression,required_permission_key,is_pii,is_exportable,visibility_classification"
    )
    .eq("domain_key", domain)
    .or(`organization_id.is.null,organization_id.eq.${context.organizationId}`)
    .order("label", { ascending: true });

  if (error) throw error;

  const authorized: AuthorizedField[] = [];
  for (const field of fields ?? []) {
    if (field.required_permission_key) {
      const { data: allowed } = await supabase.rpc("has_permission", {
        org_id: context.organizationId,
        permission_key: field.required_permission_key as PermissionKey
      });
      if (!allowed) continue;
    }
    if (field.is_pii) {
      const { data: canViewPii } = await supabase.rpc("has_permission", {
        org_id: context.organizationId,
        permission_key: "can_view_pii"
      });
      if (!canViewPii) continue;
    }
    authorized.push(field);
  }

  return { context, fields: authorized };
}

export async function runReport(input: {
  domain: ReportDomain;
  selectedFieldKeys: string[];
  filters?: ReportFilter[];
  sort?: ReportSort;
  recordRun?: boolean;
}) {
  const { context, fields } = await getAuthorizedReportFields(input.domain);
  const supabase = await createClient();

  const allowedFieldMap = new Map(
    fields
      .filter((field) => field.source_column)
      .map((field) => [field.field_key, field.source_column!])
  );

  const columns = input.selectedFieldKeys
    .map((key) => allowedFieldMap.get(key))
    .filter(Boolean) as string[];

  if (columns.length === 0) {
    return { rows: [], rowCount: 0 };
  }

  let query = supabase
    .from(domainSource[input.domain])
    .select(columns.join(","))
    .eq("organization_id", context.organizationId);

  for (const filter of input.filters ?? []) {
    const column = allowedFieldMap.get(filter.field);
    if (!column) continue;
    if (filter.operator === "eq") {
      query = query.eq(column, filter.value);
    } else {
      query = query.ilike(column, `%${filter.value}%`);
    }
  }

  if (input.sort) {
    const sortColumn = allowedFieldMap.get(input.sort.field);
    if (sortColumn) {
      query = query.order(sortColumn, { ascending: input.sort.direction === "asc" });
    }
  }

  const { data, error } = await query.limit(5000);
  if (error) throw error;

  const includedPii = fields.some(
    (field) => input.selectedFieldKeys.includes(field.field_key) && field.is_pii
  );

  if (input.recordRun !== false) {
    await supabase.from("report_runs").insert({
      organization_id: context.organizationId,
      domain_key: input.domain,
      executed_by: context.userId,
      export_format: null,
      row_count: data?.length ?? 0,
      included_pii: includedPii,
      execution_metadata: {
        selected_field_keys: input.selectedFieldKeys,
        filters: input.filters ?? [],
        sort: input.sort ?? null
      }
    });
  }

  return { rows: data ?? [], rowCount: data?.length ?? 0 };
}

export async function exportReport(params: {
  domain: ReportDomain;
  selectedFieldKeys: string[];
  format: "csv" | "excel";
}) {
  const context = await requireStaffPermission(
    params.format === "csv" ? "can_export_csv" : "can_export_excel"
  );
  const { fields } = await getAuthorizedReportFields(params.domain);
  const exportableFieldSet = new Set(
    fields.filter((field) => field.is_exportable).map((field) => field.field_key)
  );
  const selectedExportableFields = params.selectedFieldKeys.filter((fieldKey) =>
    exportableFieldSet.has(fieldKey)
  );
  if (selectedExportableFields.length === 0) {
    throw new Error("No exportable fields selected.");
  }

  const { rows } = await runReport({
    domain: params.domain,
    selectedFieldKeys: selectedExportableFields,
    recordRun: false
  });

  const includedPii = fields.some(
    (field) => selectedExportableFields.includes(field.field_key) && field.is_pii
  );

  const supabase = await createClient();
  await supabase.from("report_runs").insert({
    organization_id: context.organizationId,
    domain_key: params.domain,
    executed_by: context.userId,
    export_format: params.format,
    row_count: rows.length,
    included_pii: includedPii,
    execution_metadata: {
      selected_field_keys: selectedExportableFields,
      export_format: params.format
    }
  });

  if (params.format === "csv") {
    const headers = Object.keys(rows[0] ?? {});
    const csvRows = [
      headers.join(","),
      ...rows.map((row) =>
        headers
          .map((header) =>
            JSON.stringify(
              isRecord(row) && header in row
                ? row[header as keyof typeof row]
                : ""
            )
          )
          .join(",")
      )
    ];
    return {
      contentType: "text/csv",
      fileName: `${params.domain}-report.csv`,
      data: csvRows.join("\n")
    };
  }

  const sheet = XLSX.utils.json_to_sheet(rows as object[]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Report");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  return {
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileName: `${params.domain}-report.xlsx`,
    data: buffer
  };
}

export async function listSavedReports(domain?: ReportDomain) {
  const context = await requireStaffPermission("can_run_reports");
  const supabase = await createClient();

  let query = supabase
    .from("saved_reports")
    .select("id, name, description, domain_key, selected_fields, filters, sort_config, updated_at")
    .eq("organization_id", context.organizationId)
    .order("updated_at", { ascending: false });

  if (domain) {
    query = query.eq("domain_key", domain);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function saveReportDefinition(input: {
  id?: string;
  name: string;
  description?: string;
  domain: ReportDomain;
  selectedFieldKeys: string[];
  filters?: ReportFilter[];
  sort?: ReportSort;
}) {
  const context = await requireStaffPermission("can_build_reports");
  const supabase = await createClient();

  const payload = {
    organization_id: context.organizationId,
    name: input.name,
    description: input.description ?? null,
    domain_key: input.domain,
    selected_fields: input.selectedFieldKeys,
    filters: input.filters ?? [],
    sort_config: input.sort ?? {},
    created_by: context.userId
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("saved_reports")
      .update(payload)
      .eq("organization_id", context.organizationId)
      .eq("id", input.id)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const { data, error } = await supabase
    .from("saved_reports")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function runSavedReport(savedReportId: string) {
  const context = await requireStaffPermission("can_run_reports");
  const supabase = await createClient();

  const { data: definition, error } = await supabase
    .from("saved_reports")
    .select("id, domain_key, selected_fields, filters, sort_config")
    .eq("organization_id", context.organizationId)
    .eq("id", savedReportId)
    .single();

  if (error) throw error;

  return runReport({
    domain: definition.domain_key as ReportDomain,
    selectedFieldKeys: (definition.selected_fields ?? []) as string[],
    filters: (definition.filters ?? []) as ReportFilter[],
    sort:
      isRecord(definition.sort_config) && "field" in definition.sort_config
        ? (definition.sort_config as unknown as ReportSort)
        : undefined
  });
}
