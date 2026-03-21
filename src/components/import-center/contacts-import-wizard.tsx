"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader } from "@/components/ui/card";
import {
  buildSuggestedMappings,
  normalizeHeader,
  sanitizeInternalKey
} from "@/lib/import-center/field-mapping-engine";
import type {
  ContactClassificationInput,
  ContactStandardFieldDefinition,
  ImportCenterMapping,
  ReimportMatchSettings
} from "@/lib/import-center/types";

type Step = 1 | 2 | 3 | 4 | 5;

type MetadataPayload = {
  standardFields: ContactStandardFieldDefinition[];
  customFields: Array<Record<string, unknown>>;
  templates: Array<Record<string, unknown>>;
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

function parseTagValue(value: unknown, delimiter: string) {
  const source = toText(value);
  if (!source) return [];
  const resolvedDelimiter = delimiter || ";";
  return source
    .split(resolvedDelimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function ContactsImportWizard() {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [metadata, setMetadata] = useState<MetadataPayload>({
    standardFields: [],
    customFields: [],
    templates: []
  });
  const [customFields, setCustomFields] = useState<Array<Record<string, unknown>>>([]);

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [mappingPreviewIndex, setMappingPreviewIndex] = useState(0);

  const [classification, setClassification] = useState<ContactClassificationInput>({
    contactType: "person",
    contactCategory: "lead"
  });
  const [mappings, setMappings] = useState<ImportCenterMapping[]>([]);
  const [tagDelimiter, setTagDelimiter] = useState(";");
  const [duplicateHandling, setDuplicateHandling] = useState<"skip" | "flag">("skip");
  const [rerunMatching, setRerunMatching] = useState<ReimportMatchSettings>({
    enabled: false,
    sourceMatchColumn: null,
    destinationMatchField: null,
    onMatchBehavior: "update_blank_only",
    onNoMatchBehavior: "create_new",
    ignoreBlankOverwrites: true,
    missingKeyBehavior: "skip_row"
  });
  const [createdFieldKeys, setCreatedFieldKeys] = useState<string[]>([]);

  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [runProgress, setRunProgress] = useState<{
    status: string;
    processedRows: number;
    totalRows: number;
  } | null>(null);

  const tagsMapped = useMemo(
    () => mappings.some((mapping) => mapping.targetType === "tags"),
    [mappings]
  );

  const uniqueTagsDetected = useMemo(() => {
    const tagsMapping = mappings.find((mapping) => mapping.targetType === "tags");
    if (!tagsMapping) return 0;
    const unique = new Set<string>();
    for (const row of rows) {
      for (const tag of parseTagValue(row[tagsMapping.sourceHeader], tagDelimiter)) {
        unique.add(tag.toLowerCase());
      }
    }
    return unique.size;
  }, [mappings, rows, tagDelimiter]);

  const pendingNewFields = useMemo(
    () =>
      mappings
        .filter((mapping) => mapping.targetType === "custom" && mapping.createField)
        .map((mapping) => toText(mapping.createField?.label || mapping.sourceHeader))
        .filter(Boolean),
    [mappings]
  );

  const destinationMatchOptions = useMemo(() => {
    const standard = metadata.standardFields
      .filter((field) => field.key !== "tags")
      .map((field) => ({
        value: field.key,
        label: field.label
      }));
    const custom = customFields
      .map((field) => ({
        value: `custom:${toText(field.internal_key)}`,
        label: `${toText(field.field_label)} (Custom)`
      }))
      .filter((entry) => toText(entry.value));
    return [...standard, ...custom];
  }, [metadata.standardFields, customFields]);

  const rerunWarnings = useMemo(() => {
    if (!rerunMatching.enabled || !toText(rerunMatching.sourceMatchColumn)) {
      return { blankKeyCount: 0, duplicateKeyCount: 0 };
    }
    const sourceColumn = toText(rerunMatching.sourceMatchColumn);
    const seen = new Set<string>();
    let blankKeyCount = 0;
    let duplicateKeyCount = 0;
    for (const row of rows) {
      const key = toText(row[sourceColumn]);
      if (!key) {
        blankKeyCount += 1;
        continue;
      }
      const normalized = key.toLowerCase();
      if (seen.has(normalized)) duplicateKeyCount += 1;
      else seen.add(normalized);
    }
    return { blankKeyCount, duplicateKeyCount };
  }, [rerunMatching, rows]);

  const duplicateWarnings = useMemo(() => {
    const emailMap = mappings.find(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === "email"
    );
    const firstMap = mappings.find(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === "first_name"
    );
    const lastMap = mappings.find(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === "last_name"
    );
    const phoneMap = mappings.find(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === "phone"
    );

    let duplicateEmailCount = 0;
    let duplicateNamePhoneCount = 0;
    const seenEmails = new Set<string>();
    const seenNamePhone = new Set<string>();

    for (const row of rows) {
      if (emailMap) {
        const email = toText(row[emailMap.sourceHeader]).toLowerCase();
        if (email) {
          if (seenEmails.has(email)) duplicateEmailCount += 1;
          else seenEmails.add(email);
        }
      }
      if (firstMap && lastMap && phoneMap) {
        const phoneDigits = toText(row[phoneMap.sourceHeader]).replace(/\D+/g, "");
        const key = [
          toText(row[firstMap.sourceHeader]).toLowerCase(),
          toText(row[lastMap.sourceHeader]).toLowerCase(),
          phoneDigits
        ]
          .filter(Boolean)
          .join("|");
        if (key) {
          if (seenNamePhone.has(key)) duplicateNamePhoneCount += 1;
          else seenNamePhone.add(key);
        }
      }
    }
    return { duplicateEmailCount, duplicateNamePhoneCount };
  }, [mappings, rows]);

  useEffect(() => {
    async function loadMetadata() {
      try {
        const response = await fetch("/api/import-center/metadata?importType=contacts");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.message ?? "Unable to load Import Center metadata.");
        }
        const nextMetadata = payload as MetadataPayload;
        setMetadata(nextMetadata);
        setCustomFields(nextMetadata.customFields ?? []);
      } catch (metadataError) {
        setError(
          metadataError instanceof Error
            ? metadataError.message
            : "Unable to load Import Center metadata."
        );
      }
    }
    void loadMetadata();
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

        if (["completed", "completed_with_errors", "failed"].includes(status)) {
          setActiveJobId(null);
          setLoading(false);
          if (status === "failed") {
            setError(toText(job.processor_error) || "Import failed.");
          }
          setRunResult({
            jobId: toText(job.id),
            totalRows: Number(job.total_rows ?? 0),
            successfulRows: Number(job.successful_rows ?? 0),
            failedRows: Number(job.failed_rows ?? 0),
            skippedRows: Number(job.skipped_rows ?? 0),
            newTagsCreated: Number(job.new_tags_created ?? 0),
            matchedRecordCount: Number(job.matched_record_count ?? 0),
            overwrittenRecordCount: Number(job.overwritten_record_count ?? 0),
            blankOnlyUpdateCount: Number(job.blank_only_update_count ?? 0),
            newRecordCount: Number(job.new_record_count ?? 0),
            skippedExistingCount: Number(job.skipped_existing_count ?? 0),
            missingKeySkipCount: Number(job.missing_key_skip_count ?? 0),
            ambiguousMatchCount: Number(job.ambiguous_match_count ?? 0)
          });
          if (status !== "failed") {
            setMessage("Import finished.");
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
        setMappings(buildSuggestedMappings(detectedHeaders));
      } else {
        const buffer = await file.arrayBuffer();
        const parsed = parseWorkbook(buffer);
        const detectedHeaders = parsed.rows.length > 0 ? Object.keys(parsed.rows[0]) : [];
        setRows(parsed.rows);
        setHeaders(detectedHeaders);
        setPreviewRows(parsed.rows.slice(0, 10));
        setSheetNames(parsed.sheetNames);
        setSelectedSheet(parsed.selectedSheet);
        setMappings(buildSuggestedMappings(detectedHeaders));
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
    setMappings(buildSuggestedMappings(detectedHeaders));
    setMappingPreviewIndex(0);
  }

  function validateRerunMatchingForCurrentFile() {
    if (!selectedTemplateId || !rerunMatching.enabled) return null;
    const sourceColumn = toText(rerunMatching.sourceMatchColumn);
    const destinationField = toText(rerunMatching.destinationMatchField);
    if (!sourceColumn) {
      return "Re-Import Matching requires a source key column.";
    }
    if (!headers.includes(sourceColumn)) {
      return `Re-Import source key column "${sourceColumn}" does not exist in the uploaded file.`;
    }
    if (!destinationField) {
      return "Re-Import Matching requires a destination CRM match field.";
    }
    if (!destinationMatchOptions.some((option) => option.value === destinationField)) {
      return `Destination CRM field "${destinationField}" is not valid.`;
    }
    return null;
  }

  function applyTemplate(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setRerunMatching({
        enabled: false,
        sourceMatchColumn: null,
        destinationMatchField: null,
        onMatchBehavior: "update_blank_only",
        onNoMatchBehavior: "create_new",
        ignoreBlankOverwrites: true,
        missingKeyBehavior: "skip_row"
      });
      return;
    }
    const template = metadata.templates.find((entry) => toText(entry.id) === templateId);
    if (!template) return;

    const classificationDefaults = (template.classification_defaults ??
      {}) as Record<string, unknown>;
    const templateMappings = Array.isArray(template.mapping_configuration)
      ? (template.mapping_configuration as ImportCenterMapping[])
      : [];
    const tagConfig = (template.tag_configuration ?? {}) as Record<string, unknown>;
    const templateRerun = {
      enabled: Boolean(template.rerun_matching_enabled),
      sourceMatchColumn: toText(template.source_match_column) || null,
      destinationMatchField: toText(template.destination_match_field) || null,
      onMatchBehavior:
        toText(template.on_match_behavior) === "skip_existing"
          ? "skip_existing"
          : toText(template.on_match_behavior) === "overwrite_existing"
            ? "overwrite_existing"
            : "update_blank_only",
      onNoMatchBehavior:
        toText(template.on_no_match_behavior) === "skip_row" ? "skip_row" : "create_new",
      ignoreBlankOverwrites: true,
      missingKeyBehavior:
        toText(template.missing_key_behavior) === "treat_as_no_match"
          ? "treat_as_no_match"
          : "skip_row"
    } satisfies ReimportMatchSettings;

    setClassification({
      contactType:
        toText(classificationDefaults.contactType) === "organization" ? "organization" : "person",
      contactCategory:
        toText(classificationDefaults.contactCategory) === "donor"
          ? "donor"
          : toText(classificationDefaults.contactCategory) === "non_lead"
            ? "non_lead"
            : "lead"
    });
    setDuplicateHandling(toText(template.duplicate_handling) === "flag" ? "flag" : "skip");
    setTagDelimiter(toText(tagConfig.delimiter) || ";");
    setRerunMatching(templateRerun);

    if (headers.length === 0) {
      setMappings(templateMappings);
      return;
    }

    const existing = buildSuggestedMappings(headers);
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
        if (encoded === "tags") {
          return { ...mapping, targetType: "tags", targetKey: "tags", createField: null };
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
      if (!response.ok) throw new Error(payload?.message ?? "Unable to create custom field.");
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

  async function saveTemplateFromCurrentMapping() {
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
          importType: "contacts",
          name: name.trim(),
          mappings,
          classification,
          tagDelimiter: tagsMapped ? tagDelimiter : null,
          duplicateHandling,
          rerunMatching
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to save template.");

      const metadataResponse = await fetch("/api/import-center/templates?importType=contacts");
      const metadataPayload = await metadataResponse.json().catch(() => null);
      if (metadataResponse.ok) {
        setMetadata((prev) => ({
          ...prev,
          templates: (metadataPayload?.templates ?? []) as Array<Record<string, unknown>>
        }));
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
      const rerunError = validateRerunMatchingForCurrentFile();
      if (rerunError) {
        throw new Error(rerunError);
      }
      const formData = new FormData();
      formData.append("action", "enqueue");
      formData.append("file", uploadedFile);
      formData.append(
        "metadata",
        JSON.stringify({
          fileName,
          totalRows: rows.length,
          mappings,
          classification,
          templateId: selectedTemplateId || null,
          tagDelimiter: tagsMapped ? tagDelimiter : null,
          duplicateHandling,
          rerunMatching,
          selectedSheet: selectedSheet || null
        })
      );

      const response = await fetch("/api/import-center/jobs", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        throw new Error(toText(payload?.message) || "Unable to queue import.");
      }
      const jobId = toText(payload?.jobId);
      if (!jobId) throw new Error("Unable to queue import job. No job ID was returned.");
      setActiveJobId(jobId);
      setRunProgress({
        status: "queued",
        processedRows: 0,
        totalRows: rows.length
      });
      setRunResult(null);
      setMessage("Import queued. Processing continues in the background.");
      setLoading(false);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Unable to run import.");
      setLoading(false);
    }
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
                ? "2. Contact Classification"
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
            subtitle="Upload CSV (or Excel) and preview headers + sample rows."
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
            title="Step 2: Contact Classification"
            subtitle="Apply default type + category to all imported contacts."
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
                {metadata.templates.map((template) => (
                  <option key={toText(template.id)} value={toText(template.id)}>
                    {toText(template.name)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedTemplateId ? (
            <div className="mt-4 rounded-md border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Re-Import Matching</p>
              <p className="mb-3 text-xs text-slate-600">
                Configure how rerun imports intentionally match existing CRM records by a known key.
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Is this a rerun / refresh import?
                  </label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    value={rerunMatching.enabled ? "yes" : "no"}
                    onChange={(event) =>
                      setRerunMatching((prev) => ({
                        ...prev,
                        enabled: event.target.value === "yes"
                      }))
                    }
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>

              {rerunMatching.enabled ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium">Source key column</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={toText(rerunMatching.sourceMatchColumn)}
                      onChange={(event) =>
                        setRerunMatching((prev) => ({
                          ...prev,
                          sourceMatchColumn: event.target.value || null
                        }))
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
                    <label className="mb-1 block text-sm font-medium">Destination CRM field</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={toText(rerunMatching.destinationMatchField)}
                      onChange={(event) =>
                        setRerunMatching((prev) => ({
                          ...prev,
                          destinationMatchField: event.target.value || null
                        }))
                      }
                    >
                      <option value="">-- Select CRM field --</option>
                      {destinationMatchOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">When a match is found</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={rerunMatching.onMatchBehavior}
                      onChange={(event) =>
                        setRerunMatching((prev) => ({
                          ...prev,
                          onMatchBehavior: event.target.value as ReimportMatchSettings["onMatchBehavior"]
                        }))
                      }
                    >
                      <option value="skip_existing">Skip Existing Record</option>
                      <option value="overwrite_existing">Overwrite Existing Record</option>
                      <option value="update_blank_only">Update Only Blank Fields</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">When no match is found</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={rerunMatching.onNoMatchBehavior}
                      onChange={(event) =>
                        setRerunMatching((prev) => ({
                          ...prev,
                          onNoMatchBehavior: event.target.value as ReimportMatchSettings["onNoMatchBehavior"]
                        }))
                      }
                    >
                      <option value="create_new">Create New Record</option>
                      <option value="skip_row">Skip Row and Log It</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">
                      Blank key handling (when key is empty)
                    </label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={rerunMatching.missingKeyBehavior}
                      onChange={(event) =>
                        setRerunMatching((prev) => ({
                          ...prev,
                          missingKeyBehavior:
                            event.target.value as ReimportMatchSettings["missingKeyBehavior"]
                        }))
                      }
                    >
                      <option value="skip_row">Skip row and log</option>
                      <option value="treat_as_no_match">Treat as no-match behavior</option>
                    </select>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    Blank overwrite protection is always enabled. Blank import values never erase
                    existing populated CRM data.
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 rounded-md border border-slate-200 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-900">Duplicate Handling</p>
            <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Duplicate Handling</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={duplicateHandling}
                onChange={(event) => setDuplicateHandling(event.target.value as "skip" | "flag")}
              >
                <option value="skip">Warn + Skip Duplicates</option>
                <option value="flag">Warn + Flag Duplicates</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Contact Type</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={classification.contactType}
                onChange={(event) =>
                  setClassification((prev) => ({
                    ...prev,
                    contactType: event.target.value as "person" | "organization"
                  }))
                }
              >
                <option value="person">Person</option>
                <option value="organization">Organization</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Contact Category</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={classification.contactCategory}
                onChange={(event) =>
                  setClassification((prev) => ({
                    ...prev,
                    contactCategory: event.target.value as "lead" | "donor" | "non_lead"
                  }))
                }
              >
                <option value="lead">Lead</option>
                <option value="donor">Donor</option>
                <option value="non_lead">Non-Lead</option>
              </select>
            </div>
          </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="button"
              onClick={() => {
                const rerunError = validateRerunMatchingForCurrentFile();
                if (rerunError) {
                  setError(rerunError);
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
            subtitle="Map source headers to standard fields, tags, or contact custom fields."
          />
          <div className="mb-3 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => void saveTemplateFromCurrentMapping()}>
              Save as Template
            </Button>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="text-sm font-medium text-slate-900">Mapping Record Preview</p>
              <p className="text-xs text-slate-600">
                Navigate source records to validate mapping values before import.
              </p>
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
                      : mapping.targetType === "tags"
                        ? "tags"
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
                          <option value="unmapped">-- Leave Unmapped --</option>
                          <option value="tags">Tags</option>
                          <optgroup label="Standard Contact Fields">
                            {metadata.standardFields
                              .filter((field) => field.key !== "tags")
                              .map((field) => (
                                <option key={field.key} value={`standard:${field.key}`}>
                                  {field.label}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="Custom Fields">
                            {customFields.map((field) => (
                              <option
                                key={toText(field.id)}
                                value={`custom:${toText(field.internal_key)}`}
                              >
                                {toText(field.field_label)}
                              </option>
                            ))}
                          </optgroup>
                          <option value="create_custom">Create New Custom Field</option>
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
                          <span className="text-xs text-blue-700">Standard field mapping</span>
                        ) : mapping.targetType === "tags" ? (
                          <span className="text-xs text-emerald-700">Tag column mapping</span>
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
          {tagsMapped ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Tags delimiter (for multi-value tag columns)
                </label>
                <Input
                  value={tagDelimiter}
                  onChange={(event) => setTagDelimiter(event.target.value || ";")}
                  placeholder="; or , or |"
                />
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep(4)}>
              Continue
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 4 ? (
        <Card>
          <CardHeader
            title="Step 4: Review Import"
            subtitle="Verify settings before creating contacts."
          />
          <div className="grid gap-3 md:grid-cols-2">
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Template Selected:{" "}
              {selectedTemplateId
                ? toText(
                    metadata.templates.find((template) => toText(template.id) === selectedTemplateId)
                      ?.name
                  ) || "Yes"
                : "No"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">File: {fileName || "-"}</p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">Total Rows: {rows.length}</p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Contact Type: {classification.contactType}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Contact Category: {classification.contactCategory}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Mapping Summary:{" "}
              {mappings.filter((mapping) => mapping.targetType === "standard").length} standard,{" "}
              {mappings.filter((mapping) => mapping.targetType === "custom").length} custom,{" "}
              {mappings.filter((mapping) => mapping.targetType === "tags").length} tags,{" "}
              {mappings.filter((mapping) => mapping.targetType === "unmapped").length} unmapped
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              New Fields Created: {createdFieldKeys.length}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              New Fields Pending Creation: {pendingNewFields.length}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Tag Delimiter: {tagsMapped ? tagDelimiter : "N/A"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Re-Import Matching Enabled: {selectedTemplateId ? (rerunMatching.enabled ? "Yes" : "No") : "N/A"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Re-Import Source Key: {rerunMatching.enabled ? toText(rerunMatching.sourceMatchColumn) || "-" : "N/A"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Re-Import CRM Match Field:{" "}
              {rerunMatching.enabled ? toText(rerunMatching.destinationMatchField) || "-" : "N/A"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              On Match Behavior: {rerunMatching.enabled ? rerunMatching.onMatchBehavior : "N/A"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              On No Match Behavior: {rerunMatching.enabled ? rerunMatching.onNoMatchBehavior : "N/A"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Blank Overwrite Protection Enabled: Yes
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Duplicate Handling: {duplicateHandling === "flag" ? "Warn + Flag" : "Warn + Skip"}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Unique Tags Detected: {tagsMapped ? uniqueTagsDetected : 0}
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">
              Duplicate Warnings (email): {duplicateWarnings.duplicateEmailCount}
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">
              Duplicate Warnings (name + phone): {duplicateWarnings.duplicateNamePhoneCount}
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">
              Re-Import Key Warnings (blank keys): {rerunMatching.enabled ? rerunWarnings.blankKeyCount : 0}
            </p>
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm">
              Re-Import Key Warnings (duplicate keys):{" "}
              {rerunMatching.enabled ? rerunWarnings.duplicateKeyCount : 0}
            </p>
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">
              Multiple CRM key matches: validated during execution and logged as errors.
            </p>
          </div>
          {pendingNewFields.length > 0 ? (
            <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">Pending Custom Fields</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-700">
                {pendingNewFields.map((fieldLabel) => (
                  <li key={fieldLabel}>{fieldLabel}</li>
                ))}
              </ul>
            </div>
          ) : null}
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
            subtitle="Create contacts, assign tags, and write Import History."
          />
          <div className="space-y-3">
            <Button type="button" disabled={loading || Boolean(activeJobId)} onClick={() => void runImport()}>
              {loading
                ? "Queuing Import..."
                : activeJobId
                  ? "Import Running..."
                  : "Run Contact Import"}
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
                <p>Total New Tags Created: {toText(runResult.newTagsCreated) || "0"}</p>
                <p>Matched Record Count: {toText(runResult.matchedRecordCount) || "0"}</p>
                <p>Overwritten Record Count: {toText(runResult.overwrittenRecordCount) || "0"}</p>
                <p>Blank-Only Update Count: {toText(runResult.blankOnlyUpdateCount) || "0"}</p>
                <p>New Record Count: {toText(runResult.newRecordCount) || "0"}</p>
                <p>Skipped Existing Count: {toText(runResult.skippedExistingCount) || "0"}</p>
                <p>Missing Key Skip Count: {toText(runResult.missingKeySkipCount) || "0"}</p>
                <p>Ambiguous Match Count: {toText(runResult.ambiguousMatchCount) || "0"}</p>
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
