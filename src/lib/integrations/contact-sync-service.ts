import { createIntegrationClient } from "@/lib/integrations/db";
import { IntegrationConnection, IntegrationSyncJob } from "@/lib/integrations/types";
import { IntegrationLogService } from "@/lib/integrations/integration-log-service";
import { WebconnexApiClient } from "@/lib/integrations/webconnex-api-client";
import { GIVINGFUEL_DEFAULT_PAGE_LIMIT } from "@/lib/integrations/givingfuel-contacts-config";

type ContactSyncResult = {
  processed: number;
  created: number;
  updated: number;
  failed: number;
  cursor: string | null;
};

function readString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readDateTime(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
    }
  }
  return null;
}

export class ContactSyncService {
  async run(input: {
    organizationId: string;
    connection: IntegrationConnection;
    job: IntegrationSyncJob;
    apiClient: WebconnexApiClient;
    logService: IntegrationLogService;
  }): Promise<ContactSyncResult> {
    const supabase = await createIntegrationClient();
    const syncSettings = input.connection.sync_settings_json ?? {};
    let cursor: string | null = (syncSettings.contactsCursor as string | null | undefined) ?? null;
    let processed = 0;
    let created = 0;
    let updated = 0;
    let failed = 0;
    let hasMore = true;
    let pageGuard = 0;

    while (hasMore && pageGuard < 10000) {
      pageGuard += 1;
      const page = await input.apiClient.getContacts({
        startingAfter: cursor,
        limit: GIVINGFUEL_DEFAULT_PAGE_LIMIT
      });
      hasMore = page.hasMore;

      for (const record of page.records) {
        processed += 1;
        const externalId = readString(record, [
          "id",
          "customer_id",
          "customerId",
          "external_id",
          "contact_id",
          "donor_id"
        ]);
        if (!externalId) {
          failed += 1;
          await input.logService.enqueueError({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "contact",
            payload: record,
            errorMessage: "Missing external contact id in source payload."
          });
          continue;
        }

        try {
          const firstName = readString(record, ["first_name", "firstName", "firstNameOrgName"]);
          const lastName = readString(record, ["last_name", "lastName"]);
          const email = readString(record, ["email", "primary_email"]);
          const phone = readString(record, ["phone", "mobile_phone", "mobile", "primary_phone"]);
          const organizationName = readString(record, ["organization_name", "organization"]);
          const sourceModifiedAt = readDateTime(record, [
            "updated_at",
            "last_modified_at",
            "modified_at"
          ]);

          const { data: existingRef } = await supabase
            .from("contact_external_references")
            .select("id, contact_id")
            .eq("organization_id", input.organizationId)
            .in("source_system", ["givingfuel", "webconnex"])
            .eq("external_record_id", externalId)
            .maybeSingle();

          let contactId = (existingRef?.contact_id as string | undefined) ?? null;
          let actionTaken = "updated";

          if (!contactId) {
            const allowEmailFallback = Boolean(syncSettings.fallbackContactMatch === "email_if_configured");
            if (allowEmailFallback && email) {
              const { data: emailMatch } = await supabase
                .from("contacts")
                .select("id")
                .eq("organization_id", input.organizationId)
                .eq("email", email)
                .maybeSingle();
              contactId = (emailMatch?.id as string | undefined) ?? null;
            }
          }

          if (contactId) {
            const { error: updateError } = await supabase
              .from("contacts")
              .update({
                first_name: firstName || "Unknown",
                last_name: lastName || "Unknown",
                email: email || null,
                phone: phone || null,
                organization_name: organizationName || null,
                donor_status: "active",
                updated_at: new Date().toISOString()
              })
              .eq("organization_id", input.organizationId)
              .eq("id", contactId);
            if (updateError) throw updateError;
            updated += 1;
          } else {
            const { data: createdContact, error: createError } = await supabase
              .from("contacts")
              .insert({
                organization_id: input.organizationId,
                first_name: firstName || "Unknown",
                last_name: lastName || "Unknown",
                email: email || null,
                phone: phone || null,
                organization_name: organizationName || null,
                donor_status: "active",
                member_status: "none",
                external_source: "givingfuel",
                external_source_id: externalId
              })
              .select("id")
              .single();
            if (createError) throw createError;
            contactId = createdContact.id as string;
            created += 1;
            actionTaken = "created";
          }

          const { error: refError } = await supabase.from("contact_external_references").upsert(
            {
              organization_id: input.organizationId,
              contact_id: contactId,
              source_system: "givingfuel",
              external_record_id: externalId,
              external_record_type: "contact",
              last_source_modified_date: sourceModifiedAt,
              last_synced_date: new Date().toISOString()
            },
            { onConflict: "organization_id,source_system,external_record_id" }
          );
          if (refError) throw refError;

          await input.logService.addSyncLog({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "contact",
            sourceRecordId: externalId,
            crmRecordId: contactId,
            actionTaken,
            status: "processed",
            message: "Contact synchronized."
          });
        } catch (error) {
          failed += 1;
          await input.logService.enqueueError({
            organizationId: input.organizationId,
            integrationConnectionId: input.connection.id,
            jobId: input.job.id,
            entityType: "contact",
            sourceRecordId: externalId,
            payload: record,
            errorMessage: error instanceof Error ? error.message : "Contact sync failed."
          });
        }
      }

      cursor = page.nextCursor;
      if (!hasMore) break;
      if (!cursor) {
        hasMore = false;
      }
    }

    return {
      processed,
      created,
      updated,
      failed,
      cursor: null
    };
  }
}
