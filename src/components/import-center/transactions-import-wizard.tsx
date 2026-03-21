"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { normalizeHeader, sanitizeInternalKey } from "@/lib/import-center/field-mapping-engine";
import type {
  ImportCenterMapping,
  TransactionImportConfig,
  TransactionStandardFieldDefinition
} from "@/lib/import-center/types";
import {
  TRANSACTION_CONTACT_CREATE_FIELDS,
  TRANSACTION_CONTACT_MATCH_FIELDS,
  TRANSACTION_STANDARD_FIELDS
} from "@/lib/import-center/types";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

type CampaignOption = {
  id: string;
  label: string;
};

type MatchFieldOption = {
  key: string;
  label: string;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function parseCsv(text: string) {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0].message);
  }
  return parsed.data;
}

function parseWorkbook(buffer: ArrayBuffer, sheetName?: string) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const selectedSheet = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
  return { rows, sheetNames: workbook.SheetNames, selectedSheet };
}

function buildSuggestedTransactionMappings(headers: string[]): ImportCenterMapping[] {
  function suggestTargetKey(header: string): string | null {
    const normalized = normalizeHeader(header);
    const transactionMap: Record<string, string> = {
      amount: "transaction:amount",
      donation_amount: "transaction:amount",
      gift_amount: "transaction:amount",
      total_amount: "transaction:amount",
      donation_date: "transaction:donation_date",
      date: "transaction:donation_date",
      gift_date: "transaction:donation_date",
      transaction_date: "transaction:donation_date",
      payment_type: "transaction:payment_type",
      payment_method: "transaction:payment_type",
      payment: "transaction:payment_type",
      method: "transaction:payment_type",
      check_number: "transaction:check_number",
      check_no: "transaction:check_number",
      checknum: "transaction:check_number",
      transaction_id: "transaction:transaction_id",
      txn_id: "transaction:transaction_id",
      txn: "transaction:transaction_id",
      reference: "transaction:transaction_id",
      memo: "transaction:memo",
      note: "transaction:memo",
      notes: "transaction:memo",
      description: "transaction:memo",
      source_platform: "transaction:source_platform",
      source: "transaction:source_platform",
      platform: "transaction:source_platform",
      external_transaction_id: "transaction:external_transaction_id",
      external_id: "transaction:external_transaction_id",
      is_recurring: "transaction:is_recurring",
      recurring: "transaction:is_recurring",
      recurring_gift: "transaction:is_recurring"
    };
    if (transactionMap[normalized]) return transactionMap[normalized];

    const contactMap: Record<string, string> = {
      first_name: "contact:first_name",
      firstname: "contact:first_name",
      first: "contact:first_name",
      last_name: "contact:last_name",
      lastname: "contact:last_name",
      last: "contact:last_name",
      organization_name: "contact:organization_name",
      organization: "contact:organization_name",
      company: "contact:organization_name",
      email: "contact:email",
      primary_email: "contact:email",
      phone: "contact:phone",
      mobile: "contact:phone",
      mobile_number: "contact:phone",
      external_source_id: "contact:external_source_id",
      external_contact_id: "contact:external_source_id",
      constituent_id: "contact:external_source_id",
      donor_id: "contact:external_source_id"
    };
    return contactMap[normalized] ?? null;
  }

  return headers.map((header) => {
    const suggestedKey = suggestTargetKey(header);
    if (!suggestedKey) {
      return {
        sourceHeader: header,
        targetType: "unmapped",
        targetKey: null
      } satisfies ImportCenterMapping;
    }
    return {
      sourceHeader: header,
      targetType: "standard",
      targetKey: suggestedKey
    } satisfies ImportCenterMapping;
  });
}

function normalizeTransactionConfig(input?: Partial<TransactionImportConfig> | null): TransactionImportConfig {
  const legacyCreateMissingContact =
    input && Object.prototype.hasOwnProperty.call(input, "createMissingContact")
      ? (input as { createMissingContact?: boolean }).createMissingContact !== false
      : true;
  function normalizeCampaignAction(value: unknown) {
    const text = toText(value);
    if (!text) return "";
    if (text.startsWith("campaign:") || text.startsWith("create:")) return text;
    // Backward compatibility with old saved templates that stored raw campaign id.
    return `campaign:${text}`;
  }
  return {
    contactMatchSourceColumn: toText(input?.contactMatchSourceColumn) || null,
    contactMatchField: (toText(input?.contactMatchField) as TransactionImportConfig["contactMatchField"]) || "email",
    onNoContactMatch:
      input?.onNoContactMatch === "skip_row"
        ? "skip_row"
        : legacyCreateMissingContact
          ? "create_contact"
          : "skip_row",
    newContactType: input?.newContactType === "organization" ? "organization" : "person",
    newContactCategory:
      input?.newContactCategory === "lead" || input?.newContactCategory === "non_lead"
        ? input.newContactCategory
        : "donor",
    campaignSourceColumn: toText(input?.campaignSourceColumn) || null,
    campaignValueMap:
      input?.campaignValueMap && typeof input.campaignValueMap === "object"
        ? Object.fromEntries(
            Object.entries(input.campaignValueMap)
              .map(([sourceValue, campaignId]) => [sourceValue.toLowerCase().trim(), toText(campaignId)])
              .map(([sourceValue, action]) => [sourceValue, normalizeCampaignAction(action)])
              .filter((entry) => Boolean(entry[0]) && Boolean(entry[1]))
          )
        : {}
  };
}

export function TransactionsImportWizard() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([]);
  const [customFields, setCustomFields] = useState<Array<Record<string, unknown>>>([]);
  const [createdFieldKeys, setCreatedFieldKeys] = useState<string[]>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [mappingPreviewIndex, setMappingPreviewIndex] = useState(0);

  const [mappings, setMappings] = useState<ImportCenterMapping[]>([]);
  const [config, setConfig] = useState<TransactionImportConfig>(
    normalizeTransactionConfig({
      contactMatchField: "email",
      onNoContactMatch: "create_contact",
      newContactType: "person",
      newContactCategory: "donor",
      campaignSourceColumn: null,
      campaignValueMap: {}
    })
  );
  const [contactMatchFieldOptions, setContactMatchFieldOptions] = useState<MatchFieldOption[]>(
    TRANSACTION_CONTACT_MATCH_FIELDS.map((field) => ({ key: field.key, label: field.label }))
  );

  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<{
    status: string;
    processedRows: number;
    totalRows: number;
  } | null>(null);

  const campaignSourceValues = useMemo(() => {
    if (!toText(config.campaignSourceColumn)) return [];
    const seen = new Set<string>();
    const values: string[] = [];
    for (const row of rows) {
      const value = toText(row[toText(config.campaignSourceColumn)]);
      if (!value) continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      values.push(value);
    }
    return values.sort((a, b) => a.localeCompare(b));
  }, [config.campaignSourceColumn, rows]);

  const missingCampaignMappingsCount = useMemo(() => {
    return campaignSourceValues.filter((value) => !config.campaignValueMap[value.toLowerCase()]).length;
  }, [campaignSourceValues, config.campaignValueMap]);

  const pendingNewFields = useMemo(
    () =>
      mappings
        .filter((mapping) => mapping.targetType === "custom" && mapping.createField)
        .map((mapping) => toText(mapping.createField?.label || mapping.sourceHeader))
        .filter(Boolean),
    [mappings]
  );

  const mappingSummary = useMemo(() => {
    const standard = mappings.filter((mapping) => mapping.targetType === "standard").length;
    const custom = mappings.filter((mapping) => mapping.targetType === "custom").length;
    const unmapped = mappings.filter((mapping) => mapping.targetType === "unmapped").length;
    return { standard, custom, unmapped };
  }, [mappings]);

  useEffect(() => {
    async function loadBootstrap() {
      try {
        const [templatesResponse, campaignsResponse, metadataResponse] = await Promise.all([
          fetch("/api/import-center/templates?importType=transactions"),
          fetch("/api/campaigns?status=Active"),
          fetch("/api/import-center/metadata?importType=transactions")
        ]);

        const templatesPayload = await templatesResponse.json().catch(() => null);
        const campaignsPayload = await campaignsResponse.json().catch(() => null);
        const metadataPayload = await metadataResponse.json().catch(() => null);

        if (!templatesResponse.ok) {
          throw new Error(templatesPayload?.message ?? "Unable to load transaction templates.");
        }
        if (!campaignsResponse.ok) {
          throw new Error(campaignsPayload?.message ?? "Unable to load campaigns.");
        }
        if (!metadataResponse.ok) {
          throw new Error(metadataPayload?.message ?? "Unable to load transaction metadata.");
        }

        setTemplates((templatesPayload?.templates ?? []) as Array<Record<string, unknown>>);
        const campaignOptions = ((campaignsPayload?.campaigns ?? []) as Array<Record<string, unknown>>).map(
          (campaign) => {
            const isChild = Boolean(campaign.is_child);
            const parent = toText(campaign.parent_campaign_name);
            const name = toText(campaign.name);
            const label = isChild && parent ? `${parent} > ${name}` : name;
            return {
              id: toText(campaign.id),
              label: label || "(Unnamed Campaign)"
            };
          }
        );
        setCampaigns(campaignOptions);

        const customMatchFields = ((metadataPayload?.customFields ?? []) as Array<Record<string, unknown>>)
          .filter((field) => toText(field.module) === "contacts" && Boolean(field.is_active))
          .map((field) => ({
            key: `custom:${toText(field.internal_key)}`,
            label: `Custom Field: ${toText(field.field_label) || toText(field.internal_key)}`
          }))
          .filter((entry) => entry.key !== "custom:");
        setContactMatchFieldOptions([
          ...TRANSACTION_CONTACT_MATCH_FIELDS.map((field) => ({ key: field.key, label: field.label })),
          ...customMatchFields
        ]);
        setCustomFields(
          ((metadataPayload?.customFields ?? []) as Array<Record<string, unknown>>).filter(
            (field) => toText(field.module) === "contacts" && Boolean(field.is_active)
          )
        );
      } catch (bootstrapError) {
        setError(
          bootstrapError instanceof Error ? bootstrapError.message : "Unable to load transaction import data."
        );
      }
    }
    void loadBootstrap();
  }, []);

  useEffect(() => {
    if (rows.length === 0 && mappingPreviewIndex !== 0) {
      setMappingPreviewIndex(0);
      return;
    }
    if (mappingPreviewIndex > rows.length - 1) {
      setMappingPreviewIndex(Math.max(rows.length - 1, 0));
    }
  }, [rows, mappingPreviewIndex]);

  useEffect(() => {
    const jobId = activeJobId;
    if (!jobId) return;
    let cancelled = false;

    async function pollJob() {
      try {
        const response = await fetch(`/api/import-center/jobs/${encodeURIComponent(String(jobId))}`, {
          cache: "no-store"
        });
        const payload = (await response.json().catch(() => null)) as
          | { job?: Record<string, unknown>; message?: string }
          | null;
        if (!response.ok) {
          throw new Error(toText(payload?.message) || "Unable to load import job.");
        }
        const job = (payload?.job ?? {}) as Record<string, unknown>;
        const status = toText(job.status) || "queued";
        const totalRows = Number(job.total_rows ?? rows.length);
        const processedRows = Number(
          job.processed_rows ??
            Number(job.successful_rows ?? 0) +
              Number(job.failed_rows ?? 0) +
              Number(job.skipped_rows ?? 0)
        );
        if (cancelled) return;
        setRunProgress({
          status,
          processedRows: Number.isFinite(processedRows) ? processedRows : 0,
          totalRows: Number.isFinite(totalRows) ? totalRows : 0
        });

        if (["completed", "completed_with_errors", "failed", "cancelled", "stalled"].includes(status)) {
          setActiveJobId(null);
          setLoading(false);
          if (status === "failed" || status === "stalled") {
            setError(toText(job.processor_error) || "Import failed.");
          }
          if (status === "cancelled") {
            setMessage("Transactions import was stopped. Partial results were preserved.");
          }
          setRunResult({
            jobId: toText(job.id),
            totalRows: Number(job.total_rows ?? 0),
            successfulRows: Number(job.successful_rows ?? 0),
            failedRows: Number(job.failed_rows ?? 0),
            skippedRows: Number(job.skipped_rows ?? 0),
            matchedContactCount: Number(job.matched_contact_count ?? 0),
            createdContactCount: Number(job.created_contact_count ?? 0),
            createdTransactionCount: Number(job.created_transaction_count ?? 0),
            campaignMappedCount: Number(job.campaign_mapped_count ?? 0),
            campaignUnmappedSkipCount: Number(job.campaign_unmapped_skip_count ?? 0),
            noContactMatchSkipCount: Number(job.no_contact_match_skip_count ?? 0),
            ambiguousContactMatchCount: Number(job.ambiguous_contact_match_count ?? 0)
          });
          if (!["failed", "stalled", "cancelled"].includes(status)) {
            setMessage("Transactions import finished.");
          }
        }
      } catch (pollError) {
        if (cancelled) return;
        setError(pollError instanceof Error ? pollError.message : "Unable to load import status.");
      }
    }

    void pollJob();
    const interval = window.setInterval(() => void pollJob(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeJobId, rows.length]);

  async function handleUpload(file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setRunResult(null);
    setCreatedFieldKeys([]);
    setMappingPreviewIndex(0);
    setUploadedFile(file);
    setFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".csv")) {
        const text = await file.text();
        const parsedRows = parseCsv(text);
        const detectedHeaders = parsedRows.length > 0 ? Object.keys(parsedRows[0]) : [];
        setRows(parsedRows);
        setHeaders(detectedHeaders);
        setPreviewRows(parsedRows.slice(0, 10));
        setSheetNames([]);
        setSelectedSheet("");
        setMappings(buildSuggestedTransactionMappings(detectedHeaders));
      } else {
        const buffer = await file.arrayBuffer();
        const parsed = parseWorkbook(buffer);
        const detectedHeaders = parsed.rows.length > 0 ? Object.keys(parsed.rows[0]) : [];
        setRows(parsed.rows);
        setHeaders(detectedHeaders);
        setPreviewRows(parsed.rows.slice(0, 10));
        setSheetNames(parsed.sheetNames);
        setSelectedSheet(parsed.selectedSheet);
        setMappings(buildSuggestedTransactionMappings(detectedHeaders));
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to parse file.");
    }
  }

  async function reloadWorkbookSheet(file: File, nextSheet: string) {
    const buffer = await file.arrayBuffer();
    const parsed = parseWorkbook(buffer, nextSheet);
    const detectedHeaders = parsed.rows.length > 0 ? Object.keys(parsed.rows[0]) : [];
    setRows(parsed.rows);
    setHeaders(detectedHeaders);
    setPreviewRows(parsed.rows.slice(0, 10));
    setSelectedSheet(parsed.selectedSheet);
    setMappings(buildSuggestedTransactionMappings(detectedHeaders));
    setMappingPreviewIndex(0);
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = templates.find((entry) => toText(entry.id) === templateId);
    if (!template) return;

    const templateMappings = Array.isArray(template.mapping_configuration)
      ? (template.mapping_configuration as ImportCenterMapping[])
      : [];
    const templateConfig = normalizeTransactionConfig(
      ((template.classification_defaults as Record<string, unknown> | null)?.transactionConfig ??
        template.classification_defaults ??
        {}) as Partial<TransactionImportConfig>
    );
    setConfig(templateConfig);

    if (headers.length === 0) {
      setMappings(templateMappings);
      return;
    }

    const existing = buildSuggestedTransactionMappings(headers);
    const bySourceHeader = new Map(
      templateMappings.map((mapping) => [normalizeHeader(mapping.sourceHeader), mapping])
    );
    setMappings(
      existing.map((mapping) => {
        const override = bySourceHeader.get(normalizeHeader(mapping.sourceHeader));
        return override
          ? {
              sourceHeader: mapping.sourceHeader,
              targetType: override.targetType,
              targetKey: override.targetKey,
              createField: override.createField ?? null
            }
          : mapping;
      })
    );
    setMessage(`Template "${toText(template.name)}" applied.`);
  }

  function updateMapping(index: number, encoded: string) {
    setMappings((prev) =>
      prev.map((mapping, mappingIndex) => {
        if (mappingIndex !== index) return mapping;
        if (encoded === "unmapped") {
          return { ...mapping, targetType: "unmapped", targetKey: null, createField: null };
        }
        if (encoded === "create_custom") {
          return {
            ...mapping,
            targetType: "custom",
            targetKey: sanitizeInternalKey(mapping.sourceHeader),
            createField: { label: mapping.sourceHeader, dataType: "text" }
          };
        }
        if (encoded.startsWith("standard:")) {
          return {
            ...mapping,
            targetType: "standard",
            targetKey: encoded.replace("standard:", ""),
            createField: null
          };
        }
        if (encoded.startsWith("custom:")) {
          return {
            ...mapping,
            targetType: "custom",
            targetKey: encoded.replace("custom:", ""),
            createField: null
          };
        }
        return mapping;
      })
    );
  }

  function setCampaignMappingForSourceValue(sourceValue: string, campaignId: string) {
    const normalized = sourceValue.toLowerCase();
    setConfig((prev) => ({
      ...prev,
      campaignValueMap: {
        ...prev.campaignValueMap,
        [normalized]: campaignId
      }
    }));
  }

  function autoMapCampaignValues() {
    const normalizedCampaignMap = new Map<string, string>();
    for (const campaign of campaigns) {
      normalizedCampaignMap.set(normalizeHeader(campaign.label), campaign.id);
      const lastSegment = campaign.label.split(">").slice(-1)[0]?.trim();
      if (lastSegment) normalizedCampaignMap.set(normalizeHeader(lastSegment), campaign.id);
    }
    setConfig((prev) => {
      const next = { ...prev.campaignValueMap };
      for (const sourceValue of campaignSourceValues) {
        const normalizedSource = normalizeHeader(sourceValue);
        const mappedCampaignId = normalizedCampaignMap.get(normalizedSource);
        if (mappedCampaignId && !next[sourceValue.toLowerCase()]) {
          next[sourceValue.toLowerCase()] = `campaign:${mappedCampaignId}`;
        }
      }
      return { ...prev, campaignValueMap: next };
    });
  }

  function campaignActionLabel(action: string) {
    const normalized = toText(action);
    if (!normalized) return "-";
    if (normalized.startsWith("campaign:")) {
      const campaignId = normalized.replace("campaign:", "");
      return campaigns.find((campaign) => campaign.id === campaignId)?.label ?? `Campaign ${campaignId}`;
    }
    if (normalized.startsWith("create:")) {
      return `Create "${normalized.replace("create:", "")}"`;
    }
    return normalized;
  }

  async function createCustomFieldForMapping(index: number) {
    const mapping = mappings[index];
    if (!mapping || mapping.targetType !== "custom") return;
    const label = toText(mapping.createField?.label || mapping.sourceHeader);
    const internalKey = toText(mapping.targetKey || sanitizeInternalKey(label));
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/import-center/custom-fields", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          label,
          internalKey,
          dataType: mapping.createField?.dataType ?? "text"
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(toText(payload?.message) || "Unable to create custom field.");
      }
      setCustomFields((prev) => [...prev, payload as Record<string, unknown>]);
      setCreatedFieldKeys((prev) => Array.from(new Set([...prev, internalKey])));
      setMappings((prev) =>
        prev.map((entry, entryIndex) =>
          entryIndex === index
            ? { ...entry, targetType: "custom", targetKey: internalKey, createField: null }
            : entry
        )
      );
      setMessage(`Custom field "${label}" created.`);
    } catch (customFieldError) {
      setError(
        customFieldError instanceof Error
          ? customFieldError.message
          : "Unable to create custom field."
      );
    } finally {
      setLoading(false);
    }
  }

  function validateStep2() {
    if (!toText(config.contactMatchSourceColumn)) {
      return "Select the source column that links the transaction to a contact.";
    }
    if (!headers.includes(toText(config.contactMatchSourceColumn))) {
      return `Contact match source column "${toText(config.contactMatchSourceColumn)}" was not found in the uploaded file.`;
    }
    if (!toText(config.contactMatchField)) {
      return "Select a CRM contact field to match incoming transactions.";
    }
    return null;
  }

  function validateStep3() {
    if (!toText(config.campaignSourceColumn)) {
      return "Select the source column that contains campaign values.";
    }
    if (toText(config.campaignSourceColumn) && !headers.includes(toText(config.campaignSourceColumn))) {
      return `Campaign source column "${toText(config.campaignSourceColumn)}" was not found in the uploaded file.`;
    }
    if (missingCampaignMappingsCount > 0) {
      return "Map all detected source campaign values to existing campaigns or choose create campaign.";
    }
    return null;
  }

  function validateStep4() {
    if (config.onNoContactMatch !== "create_contact") return null;
    if (config.newContactType !== "person" && config.newContactType !== "organization") {
      return "Select the contact type to use when creating unmatched contacts.";
    }
    if (!["lead", "donor", "non_lead"].includes(config.newContactCategory)) {
      return "Select the contact category to use when creating unmatched contacts.";
    }
    return null;
  }

  function validateStep5() {
    const hasAmount = mappings.some(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === "transaction:amount"
    );
    if (!hasAmount) return "Map a source column to Donation Amount.";
    const hasDate = mappings.some(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === "transaction:donation_date"
    );
    if (!hasDate) return "Map a source column to Donation Date.";
    return null;
  }

  async function saveTemplate() {
    const name = window.prompt("Template name");
    if (!name || !name.trim()) return;

    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/import-center/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          importType: "transactions",
          name: name.trim(),
          mappings,
          classification: {
            transactionConfig: config
          },
          duplicateHandling: "skip"
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to save template.");

      const templateResponse = await fetch("/api/import-center/templates?importType=transactions");
      const templatePayload = await templateResponse.json().catch(() => null);
      if (templateResponse.ok) {
        setTemplates((templatePayload?.templates ?? []) as Array<Record<string, unknown>>);
      }
      setMessage("Template saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save template.");
    } finally {
      setLoading(false);
    }
  }

  async function runImport() {
    setLoading(true);
    setError(null);
    setMessage(null);
    setRunProgress(null);
    try {
      if (!uploadedFile) {
        throw new Error("Upload a file before running import.");
      }
      const setupError = validateStep2() ?? validateStep3() ?? validateStep4() ?? validateStep5();
      if (setupError) throw new Error(setupError);
      const formData = new FormData();
      formData.append("action", "enqueue");
      formData.append("file", uploadedFile);
      formData.append(
        "metadata",
        JSON.stringify({
          fileName,
          totalRows: rows.length,
          mappings,
          templateId: selectedTemplateId || null,
          config,
          selectedSheet: selectedSheet || null
        })
      );
      const response = await fetch("/api/import-center/transactions/jobs", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error(toText(payload?.message) || "Unable to queue transactions import.");
      }
      const jobId = toText(payload?.jobId);
      if (!jobId) throw new Error("Unable to queue import job. No job ID was returned.");
      setActiveJobId(jobId);
      setRunResult(null);
      setRunProgress({
        status: "queued",
        processedRows: 0,
        totalRows: rows.length
      });
      setMessage("Transactions import queued. Processing continues in the background.");
      setLoading(false);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run transactions import.");
      setLoading(false);
    }
  }

  function mappingSelectOptions(
    transactionFields: TransactionStandardFieldDefinition[],
    contactFields: TransactionStandardFieldDefinition[],
    existingCustomFields: Array<Record<string, unknown>>
  ) {
    return (
      <>
        <option value="unmapped">-- Leave Unmapped --</option>
        <optgroup label="Transaction Fields">
          {transactionFields.map((field) => (
            <option key={`transaction-${field.key}`} value={`standard:transaction:${field.key}`}>
              {field.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Contact Fields (for auto-create)">
          {contactFields.map((field) => (
            <option key={`contact-${field.key}`} value={`standard:contact:${field.key}`}>
              {field.label}
            </option>
          ))}
        </optgroup>
        <optgroup label="Contact Custom Fields">
          {existingCustomFields.map((field) => (
            <option key={`custom-${toText(field.id)}`} value={`custom:${toText(field.internal_key)}`}>
              {toText(field.field_label)}
            </option>
          ))}
        </optgroup>
        <option value="create_custom">Create New Contact Custom Field</option>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((stepNumber) => (
          <button
            key={stepNumber}
            type="button"
            className={`rounded-full border px-3 py-1 text-xs ${
              step === stepNumber
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-slate-200 text-slate-600"
            }`}
            onClick={() => setStep(stepNumber as Step)}
          >
            {stepNumber === 1
              ? "1. Load File"
              : stepNumber === 2
                ? "2. Contact Match Setup"
                : stepNumber === 3
                  ? "3. Campaign Mapping"
                  : stepNumber === 4
                    ? "4. No Record Found Behavior"
                    : stepNumber === 5
                      ? "5. Field Mapping"
                      : stepNumber === 6
                        ? "6. Review Import"
                        : "7. Run Import"}
          </button>
        ))}
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {step === 1 ? (
        <Card>
          <CardHeader
            title="Step 1: Load File"
            subtitle="Upload CSV (or Excel) and preview headers + sample transaction rows."
          />
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Upload CSV / Excel</label>
                <Input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => void handleUpload(event.target.files?.[0] ?? null)}
                />
              </div>
              {sheetNames.length > 0 ? (
                <div>
                  <label className="mb-1 block text-sm font-medium">Worksheet</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={selectedSheet}
                    onChange={async (event) => {
                      const selected = event.target.value;
                      setSelectedSheet(selected);
                      if (uploadedFile) await reloadWorkbookSheet(uploadedFile, selected);
                    }}
                  >
                    {sheetNames.map((sheet) => (
                      <option key={sheet} value={sheet}>
                        {sheet}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>File Name: {fileName || "-"}</p>
              <p>Row Count: {rows.length}</p>
              <p>Detected Headers: {headers.length > 0 ? headers.join(", ") : "-"}</p>
            </div>
            {previewRows.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-md border border-slate-200 bg-slate-950 p-3 text-xs text-slate-100">
                <pre>{JSON.stringify(previewRows, null, 2)}</pre>
              </div>
            ) : null}
            <Button type="button" disabled={rows.length === 0} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader
            title="Step 2: Contact Match Setup"
            subtitle="Define how transaction rows find the matching contact in CRM."
          />
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Select Template (Optional)</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={selectedTemplateId}
                onChange={(event) => applyTemplate(event.target.value)}
              >
                <option value="">-- No Template --</option>
                {templates.map((template) => (
                  <option key={toText(template.id)} value={toText(template.id)}>
                    {toText(template.name)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Contact match source column</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={toText(config.contactMatchSourceColumn)}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, contactMatchSourceColumn: event.target.value || null }))
                }
              >
                <option value="">-- Select source column --</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium">Contact match CRM field</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={config.contactMatchField}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    contactMatchField: event.target.value as TransactionImportConfig["contactMatchField"]
                  }))
                }
              >
                {contactMatchFieldOptions.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                const setupError = validateStep2();
                if (setupError) {
                  setError(setupError);
                  return;
                }
                setError(null);
                setStep(3);
              }}
            >
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader
            title="Step 3: Campaign Mapping"
            subtitle="Select campaign source column and map every source value to existing campaign or create new."
          />
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Campaign source column</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={toText(config.campaignSourceColumn)}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, campaignSourceColumn: event.target.value || null }))
                }
              >
                <option value="">-- Select campaign column --</option>
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Source Campaign Values</p>
                  <p className="text-xs text-slate-600">
                    Map each unique source value to an existing campaign or create a new campaign.
                  </p>
                </div>
                <Button type="button" variant="secondary" onClick={autoMapCampaignValues}>
                  Auto-map by Name
                </Button>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2">Source Campaign Value</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaignSourceValues.map((sourceValue) => (
                      <tr key={sourceValue} className="border-b border-slate-100">
                        <td className="py-2">{sourceValue}</td>
                        <td className="py-2">
                          <select
                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                            value={toText(config.campaignValueMap[sourceValue.toLowerCase()])}
                            onChange={(event) =>
                              setCampaignMappingForSourceValue(sourceValue, event.target.value || "")
                            }
                          >
                            <option value="">-- Select action --</option>
                            {campaigns.map((campaign) => (
                              <option key={campaign.id} value={`campaign:${campaign.id}`}>
                                Use Existing: {campaign.label}
                              </option>
                            ))}
                            <option value={`create:${sourceValue}`}>Create New Campaign: {sourceValue}</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                    {campaignSourceValues.length === 0 ? (
                      <tr>
                        <td className="py-2 text-slate-500" colSpan={2}>
                          No campaign values detected in the selected source column.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                Unmapped campaign values: {missingCampaignMappingsCount}
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const campaignError = validateStep3();
                  if (campaignError) {
                    setError(campaignError);
                    return;
                  }
                  setError(null);
                  setStep(4);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader
            title="Step 4: No Record Found Behavior"
            subtitle="Define behavior when no matching contact record is found."
          />
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">When no contact match is found</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={config.onNoContactMatch}
                onChange={(event) =>
                  setConfig((prev) => ({
                    ...prev,
                    onNoContactMatch: event.target.value as TransactionImportConfig["onNoContactMatch"]
                  }))
                }
              >
                <option value="create_contact">Create New Contact</option>
                <option value="skip_row">Skip Row and Log It</option>
              </select>
            </div>

            {config.onNoContactMatch === "create_contact" ? (
              <div className="grid gap-4 md:grid-cols-2 rounded-md border border-slate-200 p-4">
                <div>
                  <label className="mb-1 block text-sm font-medium">New contact type</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={config.newContactType}
                    onChange={(event) =>
                      setConfig((prev) => ({
                        ...prev,
                        newContactType: event.target.value as "person" | "organization"
                      }))
                    }
                  >
                    <option value="person">Person</option>
                    <option value="organization">Organization</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium">New contact category</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={config.newContactCategory}
                    onChange={(event) =>
                      setConfig((prev) => ({
                        ...prev,
                        newContactCategory: event.target.value as "lead" | "donor" | "non_lead"
                      }))
                    }
                  >
                    <option value="donor">Donor</option>
                    <option value="lead">Lead</option>
                    <option value="non_lead">Non-Lead</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button
                type="button"
                onClick={() => {
                  const behaviorError = validateStep4();
                  if (behaviorError) {
                    setError(behaviorError);
                    return;
                  }
                  setError(null);
                  setStep(5);
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <CardHeader
            title="Step 5: Field Mapping"
            subtitle="Map transaction fields and optional contact fields for create-contact behavior."
          />
          <div className="mb-3 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => void saveTemplate()}>
              Save as Template
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Mapping Record Preview</p>
              <p className="text-xs text-slate-600">Navigate sample records to validate mapping values.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMappingPreviewIndex((prev) => Math.max(prev - 1, 0))}
                disabled={mappingPreviewIndex <= 0}
              >
                Previous
              </Button>
              <span className="text-xs text-slate-700">
                Record {rows.length === 0 ? 0 : mappingPreviewIndex + 1} of {rows.length}
              </span>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setMappingPreviewIndex((prev) => Math.min(prev + 1, Math.max(rows.length - 1, 0)))
                }
                disabled={rows.length === 0 || mappingPreviewIndex >= rows.length - 1}
              >
                Next
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2">Source Header</th>
                  <th className="py-2">Sample Value</th>
                  <th className="py-2">Mapping</th>
                  <th className="py-2">Custom Field Setup</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping, index) => {
                  const encodedValue =
                    mapping.targetType === "unmapped"
                      ? "unmapped"
                      : mapping.targetType === "standard"
                        ? `standard:${mapping.targetKey ?? ""}`
                        : mapping.targetType === "custom"
                          ? `custom:${mapping.targetKey ?? ""}`
                          : "unmapped";
                  const hasPersistedCustomField =
                    mapping.targetType === "custom" &&
                    customFields.some(
                      (field) =>
                        toText(field.internal_key).toLowerCase() ===
                        toText(mapping.targetKey).toLowerCase()
                    );
                  return (
                    <tr key={mapping.sourceHeader} className="border-b border-slate-100">
                      <td className="py-2">{mapping.sourceHeader}</td>
                      <td className="py-2 text-slate-600">
                        {toText(rows[mappingPreviewIndex]?.[mapping.sourceHeader]) || "-"}
                      </td>
                      <td className="py-2">
                        <select
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                          value={encodedValue}
                          onChange={(event) => updateMapping(index, event.target.value)}
                        >
                          {mappingSelectOptions(
                            TRANSACTION_STANDARD_FIELDS,
                            TRANSACTION_CONTACT_CREATE_FIELDS,
                            customFields
                          )}
                        </select>
                      </td>
                      <td className="py-2">
                        {mapping.targetType === "custom" && !hasPersistedCustomField ? (
                          <div className="space-y-2">
                            <Input
                              value={toText(mapping.createField?.label || mapping.sourceHeader)}
                              onChange={(event) =>
                                setMappings((prev) =>
                                  prev.map((entry, entryIndex) =>
                                    entryIndex === index
                                      ? {
                                          ...entry,
                                          targetType: "custom",
                                          targetKey: sanitizeInternalKey(event.target.value),
                                          createField: {
                                            label: event.target.value || mapping.sourceHeader,
                                            dataType: "text"
                                          }
                                        }
                                      : entry
                                  )
                                )
                              }
                              placeholder="Field label"
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={loading}
                              onClick={() => void createCustomFieldForMapping(index)}
                            >
                              Create New Field
                            </Button>
                          </div>
                        ) : mapping.targetType === "custom" ? (
                          <span className="text-xs text-slate-600">Mapped to existing custom field.</span>
                        ) : mapping.targetType === "standard" ? (
                          <span className="text-xs text-blue-700">Standard mapping</span>
                        ) : (
                          <span className="text-xs text-slate-500">Not mapped</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(4)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                const mappingError = validateStep5();
                if (mappingError) {
                  setError(mappingError);
                  return;
                }
                setError(null);
                setStep(6);
              }}
            >
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 6 ? (
        <Card>
          <CardHeader
            title="Step 6: Review Import"
            subtitle="Confirm matching, campaign mapping, no-match behavior, and field mappings before run."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">File: {fileName || "-"}</p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">Total Rows: {rows.length}</p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Template Selected:{" "}
              {selectedTemplateId
                ? toText(templates.find((template) => toText(template.id) === selectedTemplateId)?.name) || "Yes"
                : "No"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Contact Match: {toText(config.contactMatchSourceColumn) || "-"} → {config.contactMatchField}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              No Contact Match Behavior:{" "}
              {config.onNoContactMatch === "create_contact" ? "Create New Contact" : "Skip Row and Log It"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              New Contact Defaults: {config.newContactType} / {config.newContactCategory}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Campaign Source Column: {toText(config.campaignSourceColumn) || "-"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Campaign Values Detected: {campaignSourceValues.length}
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">
              Campaign Values Unmapped: {missingCampaignMappingsCount}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Mapping Summary: {mappingSummary.standard} standard, {mappingSummary.custom} custom,{" "}
              {mappingSummary.unmapped} unmapped
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              New Fields Created: {createdFieldKeys.length}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              New Fields Pending Creation: {pendingNewFields.length}
            </p>
          </div>
          {campaignSourceValues.length > 0 ? (
            <div className="mt-4 max-h-56 overflow-auto rounded-md border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="py-2 px-2">Source Campaign Value</th>
                    <th className="py-2 px-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {campaignSourceValues.map((sourceValue) => (
                    <tr key={sourceValue} className="border-b border-slate-100">
                      <td className="py-2 px-2">{sourceValue}</td>
                      <td className="py-2 px-2">
                        {campaignActionLabel(toText(config.campaignValueMap[sourceValue.toLowerCase()]))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(5)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(7)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 7 ? (
        <Card>
          <CardHeader
            title="Step 7: Run Import"
            subtitle="Import transactions, link contacts, create missing contacts (if selected), and resolve campaigns."
          />
          <div className="space-y-3">
            <Button type="button" disabled={loading || Boolean(activeJobId)} onClick={() => void runImport()}>
              {loading
                ? "Queuing Import..."
                : activeJobId
                  ? "Import Running..."
                  : "Run Transactions Import"}
            </Button>
            {runProgress ? (
              <p className="text-xs text-slate-600">
                Status: {runProgress.status} ({runProgress.processedRows} / {runProgress.totalRows} rows)
              </p>
            ) : null}
            {runResult ? (
              <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <p>Total Rows Processed: {toText(runResult.totalRows) || "0"}</p>
                <p>Successful Imports: {toText(runResult.successfulRows) || "0"}</p>
                <p>Failed Rows: {toText(runResult.failedRows) || "0"}</p>
                <p>Skipped Rows: {toText(runResult.skippedRows) || "0"}</p>
                <p>Matched Existing Contacts: {toText(runResult.matchedContactCount) || "0"}</p>
                <p>Created Contacts: {toText(runResult.createdContactCount) || "0"}</p>
                <p>Created Transactions: {toText(runResult.createdTransactionCount) || "0"}</p>
                <p>Campaign Mapped Rows: {toText(runResult.campaignMappedCount) || "0"}</p>
                <p>Campaign Unmapped Skips: {toText(runResult.campaignUnmappedSkipCount) || "0"}</p>
                <p>No Contact Match Skips: {toText(runResult.noContactMatchSkipCount) || "0"}</p>
                <p>Ambiguous Contact Matches: {toText(runResult.ambiguousContactMatchCount) || "0"}</p>
                {(Number(runResult.failedRows ?? 0) > 0 || Number(runResult.skippedRows ?? 0) > 0) &&
                toText(runResult.jobId) ? (
                  <a
                    className="inline-flex rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    href={`/api/import-center/jobs/${encodeURIComponent(toText(runResult.jobId))}/errors`}
                  >
                    Download Error Log (CSV)
                  </a>
                ) : null}
              </div>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => setStep(6)}>
              Back
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
