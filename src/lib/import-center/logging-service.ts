import { resolveImportCenterSupabaseClient } from "@/lib/import-center/execution-context";

export async function appendImportCenterRowError(input: {
  organizationId: string;
  jobId: string;
  rowIndex: number;
  errorMessage: string;
  rawRow: Record<string, unknown>;
}) {
  const supabase = await resolveImportCenterSupabaseClient();
  const { error } = await supabase.from("import_center_job_errors").insert({
    organization_id: input.organizationId,
    import_center_job_id: input.jobId,
    row_index: input.rowIndex,
    error_message: input.errorMessage,
    raw_row: input.rawRow
  });
  if (error) throw error;
}

export async function logImportCenterAudit(input: {
  organizationId: string;
  userId: string;
  actionType:
    | "import_center_template_created"
    | "import_center_template_updated"
    | "import_center_template_deleted"
    | "import_center_template_cloned"
    | "import_center_contacts_run"
    | "import_center_transactions_run";
  targetEntityType: string;
  targetEntityId: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await resolveImportCenterSupabaseClient();
  const { error } = await supabase.from("audit_log").insert({
    organization_id: input.organizationId,
    actor_user_id: input.userId,
    action_type: input.actionType,
    target_entity_type: input.targetEntityType,
    target_entity_id: input.targetEntityId,
    metadata: input.metadata ?? {}
  });
  if (error) throw error;
}
