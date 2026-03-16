"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import { normalizeHeader } from "@/lib/import-center/field-mapping-engine";
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

type Step = 1 | 2 | 3 | 4 | 5;

type CampaignOption = {
  id: string;
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
  return {
    contactMatchSourceColumn: toText(input?.contactMatchSourceColumn) || null,
    contactMatchField: input?.contactMatchField ?? "email",
    createMissingContact: input?.createMissingContact !== false,
    newContactType: input?.newContactType === "organization" ? "organization" : "person",
    newContactCategory:
      input?.newContactCategory === "lead" || input?.newContactCategory === "non_lead"
        ? input.newContactCategory
        : "donor",
    campaignMappingEnabled: Boolean(input?.campaignMappingEnabled),
    campaignSourceColumn: toText(input?.campaignSourceColumn) || null,
    defaultCampaignId: toText(input?.defaultCampaignId) || null,
    campaignValueMap:
      input?.campaignValueMap && typeof input.campaignValueMap === "object"
        ? Object.fromEntries(
            Object.entries(input.campaignValueMap)
              .map(([sourceValue, campaignId]) => [sourceValue.toLowerCase().trim(), toText(campaignId)])
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

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
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
      createMissingContact: true,
      newContactType: "person",
      newContactCategory: "donor",
      campaignMappingEnabled: false,
      campaignValueMap: {}
    })
  );

  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [runProgress, setRunProgress] = useState<{
    currentChunk: number;
    totalChunks: number;
    processedRows: number;
    totalRows: number;
  } | null>(null);

  const campaignSourceValues = useMemo(() => {
    if (!config.campaignMappingEnabled || !toText(config.campaignSourceColumn)) return [];
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
  }, [config.campaignMappingEnabled, config.campaignSourceColumn, rows]);

  const missingCampaignMappingsCount = useMemo(() => {
    if (!config.campaignMappingEnabled) return 0;
    return campaignSourceValues.filter((value) => !config.campaignValueMap[value.toLowerCase()]).length;
  }, [campaignSourceValues, config.campaignMappingEnabled, config.campaignValueMap]);

  const mappingSummary = useMemo(() => {
    const standard = mappings.filter((mapping) => mapping.targetType === "standard").length;
    const unmapped = mappings.filter((mapping) => mapping.targetType === "unmapped").length;
    return { standard, unmapped };
  }, [mappings]);

  useEffect(() => {
    async function loadBootstrap() {
      try {
        const [templatesResponse, campaignsResponse] = await Promise.all([
          fetch("/api/import-center/templates?importType=transactions"),
          fetch("/api/campaigns?status=Active")
        ]);

        const templatesPayload = await templatesResponse.json().catch(() => null);
        const campaignsPayload = await campaignsResponse.json().catch(() => null);

        if (!templatesResponse.ok) {
          throw new Error(templatesPayload?.message ?? "Unable to load transaction templates.");
        }
        if (!campaignsResponse.ok) {
          throw new Error(campaignsPayload?.message ?? "Unable to load campaigns.");
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

  async function handleUpload(file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setRunResult(null);
    setMappingPreviewIndex(0);
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
              targetKey: override.targetKey
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
          return { ...mapping, targetType: "unmapped", targetKey: null };
        }
        if (encoded.startsWith("standard:")) {
          return {
            ...mapping,
            targetType: "standard",
            targetKey: encoded.replace("standard:", "")
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
          next[sourceValue.toLowerCase()] = mappedCampaignId;
        }
      }
      return { ...prev, campaignValueMap: next };
    });
  }

  function validateStep2() {
    if (!toText(config.contactMatchSourceColumn)) {
      return "Select the source column that links the transaction to a contact.";
    }
    if (!headers.includes(toText(config.contactMatchSourceColumn))) {
      return `Contact match source column "${toText(config.contactMatchSourceColumn)}" was not found in the uploaded file.`;
    }
    if (!toText(config.defaultCampaignId)) {
      return "Select a default campaign for imported transactions.";
    }
    if (config.campaignMappingEnabled && !toText(config.campaignSourceColumn)) {
      return "Campaign mapping is enabled; select a campaign source column.";
    }
    if (
      config.campaignMappingEnabled &&
      toText(config.campaignSourceColumn) &&
      !headers.includes(toText(config.campaignSourceColumn))
    ) {
      return `Campaign source column "${toText(config.campaignSourceColumn)}" was not found in the uploaded file.`;
    }
    return null;
  }

  function validateStep3() {
    const hasAmount = mappings.some(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === "transaction:amount"
    );
    if (!hasAmount) return "Map a source column to Donation Amount.";
    const hasDate = mappings.some(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === "transaction:donation_date"
    );
    if (!hasDate) return "Map a source column to Donation Date.";
    if (config.campaignMappingEnabled && missingCampaignMappingsCount > 0) {
      return "Map all detected source campaign values to existing CRM campaigns before continuing.";
    }
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
    const CHUNK_SIZE = 100;
    setLoading(true);
    setError(null);
    setMessage(null);
    setRunProgress(null);
    try {
      const setupError = validateStep2() ?? validateStep3();
      if (setupError) throw new Error(setupError);

      const startResponse = await fetch("/api/import-center/transactions/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "start",
          fileName,
          totalRows: rows.length,
          mappings,
          templateId: selectedTemplateId || null,
          config
        })
      });
      const startPayload = (await startResponse.json().catch(() => null)) as Record<string, unknown> | null;
      if (!startResponse.ok) {
        throw new Error(toText(startPayload?.message) || "Unable to start transactions import.");
      }
      const jobId = toText(startPayload?.jobId);
      if (!jobId) throw new Error("Import did not return a job ID.");

      const totalChunks = Math.max(1, Math.ceil(rows.length / CHUNK_SIZE));
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const rowOffset = chunkIndex * CHUNK_SIZE;
        const chunkRows = rows.slice(rowOffset, rowOffset + CHUNK_SIZE);
        setRunProgress({
          currentChunk: chunkIndex + 1,
          totalChunks,
          processedRows: Math.min(rowOffset, rows.length),
          totalRows: rows.length
        });

        const chunkResponse = await fetch("/api/import-center/transactions/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "chunk",
            jobId,
            rows: chunkRows,
            rowOffset
          })
        });
        const chunkPayload = (await chunkResponse.json().catch(() => null)) as Record<string, unknown> | null;
        if (!chunkResponse.ok) {
          throw new Error(toText(chunkPayload?.message) || `Chunk ${chunkIndex + 1} failed.`);
        }
      }

      const completeResponse = await fetch("/api/import-center/transactions/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          jobId
        })
      });
      const completePayload = (await completeResponse.json().catch(() => null)) as
        | Record<string, unknown>
        | null;
      if (!completeResponse.ok) {
        throw new Error(toText(completePayload?.message) || "Import completed chunks but failed to finalize.");
      }
      setRunProgress({
        currentChunk: totalChunks,
        totalChunks,
        processedRows: rows.length,
        totalRows: rows.length
      });
      setRunResult(completePayload);
      setMessage("Transactions import finished.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run transactions import.");
    } finally {
      setLoading(false);
    }
  }

  function mappingSelectOptions(
    transactionFields: TransactionStandardFieldDefinition[],
    contactFields: TransactionStandardFieldDefinition[]
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
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((stepNumber) => (
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
                ? "2. Contact & Campaign Setup"
                : stepNumber === 3
                  ? "3. Field Mapping"
                  : stepNumber === 4
                    ? "4. Review Import"
                    : "5. Run Import"}
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
                      const file = (document.querySelector(
                        'input[type="file"]'
                      ) as HTMLInputElement | null)?.files?.[0];
                      if (file) await reloadWorkbookSheet(file, selected);
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
            title="Step 2: Contact & Campaign Setup"
            subtitle="Define how transactions match contacts and how campaign values map."
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
            <div>
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
                {TRANSACTION_CONTACT_MATCH_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Default campaign (required)</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={toText(config.defaultCampaignId)}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, defaultCampaignId: event.target.value || null }))
                }
              >
                <option value="">-- Select default campaign --</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 p-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={config.createMissingContact}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, createMissingContact: event.target.checked }))
                }
              />
              Create a new contact if no match is found
            </label>

            {config.createMissingContact ? (
              <div className="mt-3 grid gap-4 md:grid-cols-2">
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
          </div>

          <div className="mt-4 rounded-md border border-slate-200 p-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={config.campaignMappingEnabled}
                onChange={(event) =>
                  setConfig((prev) => ({ ...prev, campaignMappingEnabled: event.target.checked }))
                }
              />
              This file has a Campaign column to map before import
            </label>
            {config.campaignMappingEnabled ? (
              <div className="mt-3">
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
            ) : null}
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
            title="Step 3: Field Mapping"
            subtitle="Map transaction fields and optional contact fields for auto-create."
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
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping, index) => {
                  const encodedValue =
                    mapping.targetType === "unmapped"
                      ? "unmapped"
                      : mapping.targetType === "standard"
                        ? `standard:${mapping.targetKey ?? ""}`
                        : "unmapped";
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
                          {mappingSelectOptions(TRANSACTION_STANDARD_FIELDS, TRANSACTION_CONTACT_CREATE_FIELDS)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {config.campaignMappingEnabled && toText(config.campaignSourceColumn) ? (
            <div className="mt-5 rounded-md border border-slate-200 p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Campaign Value Review & Mapping</p>
                  <p className="text-xs text-slate-600">
                    Map each source campaign value to an existing CRM campaign before import.
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
                      <th className="py-2">Mapped CRM Campaign</th>
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
                            <option value="">-- Select campaign --</option>
                            {campaigns.map((campaign) => (
                              <option key={campaign.id} value={campaign.id}>
                                {campaign.label}
                              </option>
                            ))}
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
          ) : null}

          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                const mappingError = validateStep3();
                if (mappingError) {
                  setError(mappingError);
                  return;
                }
                setError(null);
                setStep(4);
              }}
            >
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader
            title="Step 4: Review Import"
            subtitle="Confirm matching, campaign mapping, and transaction field mappings before run."
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
              Create Missing Contact: {config.createMissingContact ? "Yes" : "No"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              New Contact Defaults: {config.newContactType} / {config.newContactCategory}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Default Campaign:{" "}
              {campaigns.find((campaign) => campaign.id === config.defaultCampaignId)?.label || "-"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Campaign Mapping Enabled: {config.campaignMappingEnabled ? "Yes" : "No"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Campaign Source Column: {config.campaignMappingEnabled ? toText(config.campaignSourceColumn) || "-" : "N/A"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Campaign Values Detected: {campaignSourceValues.length}
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">
              Campaign Values Unmapped: {missingCampaignMappingsCount}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Mapping Summary: {mappingSummary.standard} mapped, {mappingSummary.unmapped} unmapped
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(3)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(5)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 5 ? (
        <Card>
          <CardHeader
            title="Step 5: Run Import"
            subtitle="Import transactions, link (or create) contacts, and attach to mapped campaigns."
          />
          <div className="space-y-3">
            <Button type="button" disabled={loading} onClick={() => void runImport()}>
              {loading ? "Running Import..." : "Run Transactions Import"}
            </Button>
            {runProgress ? (
              <p className="text-xs text-slate-600">
                Processing chunk {runProgress.currentChunk} of {runProgress.totalChunks} (
                {runProgress.processedRows} / {runProgress.totalRows} rows)
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
            <Button type="button" variant="secondary" onClick={() => setStep(4)}>
              Back
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
