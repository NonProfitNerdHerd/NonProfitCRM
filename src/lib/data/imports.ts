import Papa from "papaparse";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";

type ImportDomain = "contacts" | "donations";
type MappingConfig = Record<string, string>;

export async function createImportJob(params: {
  domain: ImportDomain;
  sourcePlatform: string;
  fileName: string;
  mapping: MappingConfig;
}) {
  const context = await requireStaffPermission("can_manage_imports");
  const supabase = await createClient();

  const { data: job, error } = await supabase
    .from("import_jobs")
    .insert({
      organization_id: context.organizationId,
      source_platform: params.sourcePlatform,
      source_type: "csv",
      target_domain: params.domain,
      original_file_name: params.fileName,
      status: "mapped",
      created_by: context.userId
    })
    .select("id")
    .single();

  if (error) throw error;

  const mappingRows = Object.entries(params.mapping).map(
    ([source_field, target_field]) => ({
      organization_id: context.organizationId,
      import_job_id: job.id,
      source_field,
      target_field,
      transform_rule: null
    })
  );

  if (mappingRows.length) {
    const { error: mappingError } = await supabase
      .from("import_mappings")
      .insert(mappingRows);
    if (mappingError) throw mappingError;
  }

  return { jobId: job.id, organizationId: context.organizationId, userId: context.userId };
}

export async function processCsvImport(params: {
  domain: ImportDomain;
  sourcePlatform: string;
  fileName: string;
  csvText: string;
  mapping: MappingConfig;
}) {
  const { jobId, organizationId, userId } = await createImportJob({
    domain: params.domain,
    sourcePlatform: params.sourcePlatform,
    fileName: params.fileName,
    mapping: params.mapping
  });
  const supabase = await createClient();

  const parsed = Papa.parse<Record<string, string>>(params.csvText, {
    header: true,
    skipEmptyLines: true
  });

  if (parsed.errors.length > 0) {
    await supabase
      .from("import_jobs")
      .update({
        status: "failed",
        error_summary: parsed.errors.map((err) => err.message).join("; ")
      })
      .eq("id", jobId);
    throw new Error(parsed.errors[0].message);
  }

  await supabase
    .from("import_jobs")
    .update({ status: "processing", total_rows: parsed.data.length })
    .eq("id", jobId);

  let successCount = 0;
  let failureCount = 0;
  const failures: string[] = [];
  const campaignCache = new Map<string, string>();

  for (const row of parsed.data) {
    try {
      if (params.domain === "contacts") {
        const externalId = row[params.mapping.external_source_id ?? "external_source_id"];
        const organizationName = row[params.mapping.organization_name ?? "organization_name"] ?? null;
        const entityType =
          typeof organizationName === "string" && organizationName.trim().length > 0
            ? "organization"
            : "person";
        const sourcePlatform = String(params.sourcePlatform ?? "").toLowerCase();
        const webconnexId =
          (sourcePlatform === "webconnex" || sourcePlatform === "givingfuel") && externalId
            ? String(externalId)
            : null;
        const rawTrackingStatus = String(
          row[params.mapping.tracking_status ?? "tracking_status"] ?? ""
        ).toLowerCase();
        const trackingStatus =
          webconnexId
            ? "donor"
            : rawTrackingStatus === "donor" ||
                rawTrackingStatus === "lead" ||
                rawTrackingStatus === "non_lead"
              ? rawTrackingStatus
              : "lead";
        const payload = {
          organization_id: organizationId,
          first_name: row[params.mapping.first_name ?? "first_name"] ?? "Unknown",
          last_name: row[params.mapping.last_name ?? "last_name"] ?? "Unknown",
          email: row[params.mapping.email ?? "email"] ?? null,
          phone: row[params.mapping.phone ?? "phone"] ?? null,
          donor_status:
            row[params.mapping.donor_status ?? "donor_status"] ??
            (trackingStatus === "donor" ? "active" : trackingStatus === "non_lead" ? "inactive" : "prospect"),
          member_status: row[params.mapping.member_status ?? "member_status"] ?? "none",
          tracking_status: trackingStatus,
          entity_type: entityType,
          webconnex_id: webconnexId,
          external_source: params.sourcePlatform,
          external_source_id: externalId || null,
          organization_name:
            typeof organizationName === "string" && organizationName.trim().length > 0
              ? organizationName
              : null,
          created_by: userId,
          updated_by: userId,
          import_job_id: jobId
        };

        const query = supabase.from("contacts");
        if (externalId) {
          const { error } = await query.upsert(payload, {
            onConflict: "organization_id,external_source,external_source_id"
          });
          if (error) throw error;
        } else {
          const { error } = await query.insert(payload);
          if (error) throw error;
        }
      }

      if (params.domain === "donations") {
        const contactExternalId =
          row[params.mapping.contact_external_source_id ?? "contact_external_source_id"];
        const { data: contact } = await supabase
          .from("contacts")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("external_source", params.sourcePlatform)
          .eq("external_source_id", contactExternalId)
          .maybeSingle();

        const campaignName =
          row[params.mapping.campaign ?? "campaign"]?.trim() || "Imported Donations";
        let campaignId = campaignCache.get(campaignName);
        if (!campaignId) {
          const { data: existingCampaign } = await supabase
            .from("campaigns")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("name", campaignName)
            .maybeSingle();

          if (existingCampaign?.id) {
            campaignId = existingCampaign.id;
          } else {
            const { data: createdCampaign, error: campaignInsertError } = await supabase
              .from("campaigns")
              .insert({
                organization_id: organizationId,
                name: campaignName,
                status: "Active",
                description: "Auto-created from import pipeline",
                created_by: userId
              })
              .select("id")
              .single();
            if (campaignInsertError) throw campaignInsertError;
            campaignId = createdCampaign.id;
          }
          if (!campaignId) {
            throw new Error("Unable to resolve campaign for imported donation row.");
          }
          campaignCache.set(campaignName, campaignId);
        }

        const paymentType =
          row[params.mapping.payment_type ?? "payment_type"]?.trim() || "Cash";
        const checkNumber = row[params.mapping.check_number ?? "check_number"]?.trim() || null;
        const transactionId =
          row[params.mapping.transaction_id ?? "transaction_id"]?.trim() || null;

        const payload = {
          organization_id: organizationId,
          contact_id: contact?.id ?? null,
          campaign_id: campaignId,
          amount: Number(row[params.mapping.amount ?? "amount"] ?? 0),
          currency: row[params.mapping.currency ?? "currency"] ?? "USD",
          donation_date:
            row[params.mapping.donation_date ?? "donation_date"] ??
            new Date().toISOString().slice(0, 10),
          status: row[params.mapping.status ?? "status"] ?? "posted",
          payment_type: paymentType,
          check_number: checkNumber,
          transaction_id: transactionId,
          campaign: campaignName,
          source: "import",
          source_platform: params.sourcePlatform,
          external_transaction_id:
            row[params.mapping.external_transaction_id ?? "external_transaction_id"] ??
            null,
          import_job_id: jobId,
          imported_at: new Date().toISOString()
        };

        const externalTransactionId = payload.external_transaction_id;
        if (externalTransactionId) {
          const { error } = await supabase.from("donations").upsert(payload, {
            onConflict: "organization_id,source_platform,external_transaction_id"
          });
          if (error) throw error;
        } else {
          const { error } = await supabase.from("donations").insert(payload);
          if (error) throw error;
        }
      }
      successCount += 1;
    } catch (error) {
      failureCount += 1;
      failures.push(error instanceof Error ? error.message : "Unknown import error");
    }
  }

  await supabase
    .from("import_jobs")
    .update({
      status: failureCount > 0 ? "failed" : "completed",
      processed_rows: successCount + failureCount,
      successful_rows: successCount,
      failed_rows: failureCount,
      error_summary: failures.join("; "),
      completed_at: new Date().toISOString()
    })
    .eq("id", jobId);

  await supabase.from("audit_log").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action_type: "import_job_processed",
    target_entity_type: "import_jobs",
    target_entity_id: jobId,
    metadata: {
      source_platform: params.sourcePlatform,
      target_domain: params.domain,
      success_count: successCount,
      failure_count: failureCount
    }
  });

  return {
    jobId,
    successCount,
    failureCount,
    failures
  };
}
