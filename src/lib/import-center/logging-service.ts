import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/lib/data/audit";

export async function appendImportCenterRowError(input: {
  organizationId: string;
  jobId: string;
  rowIndex: number;
  errorMessage: string;
  rawRow: Record<string, unknown>;
}) {
  const supabase = await createClient();
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
  await logAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.userId,
    actionType: input.actionType,
    targetEntityType: input.targetEntityType,
    targetEntityId: input.targetEntityId,
    metadata: input.metadata ?? {}
  });
}
