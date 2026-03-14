"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type FieldClassification,
  type ImportEntityType,
  type ImportEntityConfig,
  type ImportRelationshipRule
} from "@/lib/imports/config";

type StepKey = "type" | "upload" | "mapping" | "relationships" | "validate" | "commit" | "results";

type MappingEntry = {
  sourceHeader: string;
  sampleValue: string;
  targetField: string;
  classification: FieldClassification;
  required: boolean;
  ignore: boolean;
  transformRule: string;
};

const steps: Array<{ key: StepKey; label: string }> = [
  { key: "type", label: "Step 1 Select Import Type" },
  { key: "upload", label: "Step 2 Upload File" },
  { key: "mapping", label: "Step 3 Review Headers and Map Fields" },
  { key: "relationships", label: "Step 4 Define Keys and Relationships" },
  { key: "validate", label: "Step 5 Validate Data" },
  { key: "commit", label: "Step 6 Import Options and Commit" },
  { key: "results", label: "Step 7 Results, Audit, and Rollback" }
];

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function parseCsv(text: string) {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true
  });
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function parseWorkbook(buffer: ArrayBuffer, sheetName?: string) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const selectedSheet = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const worksheet = workbook.Sheets[selectedSheet];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
  return { rows, sheetNames: workbook.SheetNames, selectedSheet };
}

export function ImportWizard() {
  const [step, setStep] = useState<StepKey>("type");
  const [entities, setEntities] = useState<ImportEntityConfig[]>([]);
  const [sourceSystems, setSourceSystems] = useState<string[]>([]);
  const [importModes, setImportModes] = useState<string[]>([]);

  const [entityType, setEntityType] = useState<ImportEntityType>("contact");
  const [sourceSystem, setSourceSystem] = useState("Spreadsheet / Manual");
  const [mappingTemplateName, setMappingTemplateName] = useState("");

  const [fileName, setFileName] = useState("");
  const [fileType, setFileType] = useState<"csv" | "xlsx" | "xls">("csv");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [mappings, setMappings] = useState<MappingEntry[]>([]);
  const [mappingPreviewIndex, setMappingPreviewIndex] = useState(0);

  const [relationshipSettings, setRelationshipSettings] = useState<
    Array<
      ImportRelationshipRule & {
        ifNoMatch: "error" | "skip" | "create_placeholder";
        ifMultipleMatches: "error" | "pick_first" | "hold_for_review";
      }
    >
  >([]);

  const [jobId, setJobId] = useState<string | null>(null);
  const [matchByInput, setMatchByInput] = useState("");
  const [importMode, setImportMode] = useState("upsert");

  const [validationSummary, setValidationSummary] = useState<Record<string, number> | null>(null);
  const [validationRows, setValidationRows] = useState<Array<Record<string, unknown>>>([]);
  const [commitSummary, setCommitSummary] = useState<Record<string, number> | null>(null);
  const [resultRows, setResultRows] = useState<Array<Record<string, unknown>>>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeConfig = useMemo(
    () => entities.find((entry) => entry.key === entityType) ?? null,
    [entities, entityType]
  );

  useEffect(() => {
    async function loadMetadata() {
      const response = await fetch("/api/imports/wizard/metadata");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setError(payload?.message ?? "Unable to load import metadata.");
        return;
      }
      setEntities((payload?.entities ?? []) as ImportEntityConfig[]);
      setSourceSystems((payload?.sourceSystems ?? []) as string[]);
      setImportModes((payload?.importModes ?? []) as string[]);
    }
    void loadMetadata();
  }, []);

  useEffect(() => {
    if (!activeConfig) return;
    setRelationshipSettings(
      activeConfig.relationshipRules.map((rule) => ({
        ...rule,
        ifNoMatch: rule.ifNoMatch,
        ifMultipleMatches: rule.ifMultipleMatches
      }))
    );
    setMatchByInput(activeConfig.defaultMatchBy.join(", "));
  }, [activeConfig]);

  function autoMap(nextHeaders: string[], sampleRows: Array<Record<string, unknown>>) {
    const fields = activeConfig?.fields ?? [];
    const fieldByKey = new Map(fields.map((field) => [field.key, field]));
    const mapped = nextHeaders.map((header) => {
      const normalizedHeader = normalizeHeader(header);
      const matchingField = fields.find((field) => normalizeHeader(field.key) === normalizedHeader);
      const field = matchingField ? fieldByKey.get(matchingField.key) : null;
      return {
        sourceHeader: header,
        sampleValue: String(sampleRows[0]?.[header] ?? ""),
        targetField: matchingField?.key ?? "",
        classification: matchingField?.classification ?? "basic",
        required: Boolean(field?.required),
        ignore: false,
        transformRule: ""
      } satisfies MappingEntry;
    });
    setMappings(mapped);
  }

  async function handleFileChange(file: File | null) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setJobId(null);
    setValidationSummary(null);
    setValidationRows([]);
    setCommitSummary(null);
    setResultRows([]);
    setMappingPreviewIndex(0);
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    const detectedType = lower.endsWith(".csv") ? "csv" : lower.endsWith(".xls") ? "xls" : "xlsx";
    setFileType(detectedType);

    try {
      if (detectedType === "csv") {
        const text = await file.text();
        const parsedRows = parseCsv(text);
        const nextHeaders = parsedRows.length > 0 ? Object.keys(parsedRows[0]) : [];
        setSheetNames([]);
        setSelectedSheet("");
        setRows(parsedRows);
        setPreviewRows(parsedRows.slice(0, 5));
        setHeaders(nextHeaders);
        autoMap(nextHeaders, parsedRows);
      } else {
        const buffer = await file.arrayBuffer();
        const parsed = parseWorkbook(buffer);
        setSheetNames(parsed.sheetNames);
        setSelectedSheet(parsed.selectedSheet);
        const nextHeaders = parsed.rows.length > 0 ? Object.keys(parsed.rows[0]) : [];
        setRows(parsed.rows);
        setPreviewRows(parsed.rows.slice(0, 5));
        setHeaders(nextHeaders);
        autoMap(nextHeaders, parsed.rows);
      }
      setStep("mapping");
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Unable to parse uploaded file.");
    }
  }

  async function reloadWorkbookSheet(file: File, nextSheet: string) {
    const buffer = await file.arrayBuffer();
    const parsed = parseWorkbook(buffer, nextSheet);
    setSelectedSheet(parsed.selectedSheet);
    const nextHeaders = parsed.rows.length > 0 ? Object.keys(parsed.rows[0]) : [];
    setRows(parsed.rows);
    setPreviewRows(parsed.rows.slice(0, 5));
    setHeaders(nextHeaders);
    autoMap(nextHeaders, parsed.rows);
    setMappingPreviewIndex(0);
  }

  async function ensureStagedBatch() {
    if (jobId) return jobId;
    const response = await fetch("/api/imports/wizard/stage", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        entityType,
        sourceSystem,
        fileName,
        fileType,
        headers,
        rows,
        mappings,
        relationshipSettings,
        importMode,
        matchBy: matchByInput
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to stage import batch.");
    setJobId(payload.jobId as string);
    return payload.jobId as string;
  }

  async function runValidation() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const currentJobId = await ensureStagedBatch();
      const response = await fetch("/api/imports/wizard/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: currentJobId,
          matchBy: matchByInput
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Validation failed.");
      setValidationSummary((payload.summary ?? {}) as Record<string, number>);
      setValidationRows((payload.rows ?? []) as Array<Record<string, unknown>>);
      setStep("validate");
      setMessage("Validation completed. Review rows with errors or unresolved relationships.");
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Validation failed.");
    } finally {
      setLoading(false);
    }
  }

  async function commitBatch() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/imports/wizard/commit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId,
          mode: importMode,
          matchBy: matchByInput
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Commit failed.");
      setCommitSummary(payload as Record<string, number>);
      setMessage("Import commit finished.");
      await loadResults(jobId);
      setStep("results");
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Commit failed.");
    } finally {
      setLoading(false);
    }
  }

  async function loadResults(currentJobId: string) {
    const response = await fetch(`/api/imports/wizard/results?jobId=${encodeURIComponent(currentJobId)}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to load results.");
    setResultRows((payload?.rows ?? []) as Array<Record<string, unknown>>);
  }

  async function rollbackBatch() {
    if (!jobId) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/imports/wizard/rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Rollback failed.");
      setMessage(`Rollback completed for ${String(payload.rolledBackRows ?? 0)} row changes.`);
      await loadResults(jobId);
    } catch (rollbackError) {
      setError(rollbackError instanceof Error ? rollbackError.message : "Rollback failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {steps.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`rounded-full border px-3 py-1 text-xs ${
              step === item.key ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200"
            }`}
            onClick={() => setStep(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {step === "type" ? (
        <section className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Import Type</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={entityType}
              onChange={(event) => setEntityType(event.target.value as ImportEntityType)}
            >
              {entities.map((entity) => (
                <option key={entity.key} value={entity.key}>
                  {entity.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Source System</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={sourceSystem}
              onChange={(event) => setSourceSystem(event.target.value)}
            >
              {(sourceSystems.length > 0 ? sourceSystems : ["Spreadsheet / Manual"]).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Mapping Template</label>
            <Input
              value={mappingTemplateName}
              placeholder="Template name (optional)"
              onChange={(event) => setMappingTemplateName(event.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <Button type="button" onClick={() => setStep("upload")}>
              Continue to Upload
            </Button>
          </div>
        </section>
      ) : null}

      {step === "upload" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Upload Excel / CSV</label>
              <Input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => void handleFileChange(event.target.files?.[0] ?? null)} />
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
                    const file = (document.querySelector('input[type="file"]') as HTMLInputElement)?.files?.[0];
                    if (file) await reloadWorkbookSheet(file, selected);
                  }}
                >
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
          <p className="text-sm text-slate-600">
            Detected file: {fileName || "-"} • Rows: {rows.length} • Columns: {headers.length}
          </p>
          <Button type="button" onClick={() => setStep("mapping")} disabled={headers.length === 0}>
            Continue to Mapping
          </Button>
        </section>
      ) : null}

      {step === "mapping" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">Record Preview Navigator</p>
              <p className="text-xs text-slate-600">
                Move between records to validate mapping against real source values.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setMappingPreviewIndex((prev) => Math.max(prev - 1, 0))}
                disabled={mappingPreviewIndex === 0}
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
                  <th className="py-2">Target CRM Field</th>
                  <th className="py-2">Classification</th>
                  <th className="py-2">Required</th>
                  <th className="py-2">Ignore</th>
                  <th className="py-2">Transform Rule</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map((mapping, index) => (
                  <tr key={mapping.sourceHeader} className="border-b border-slate-100">
                    <td className="py-2">{mapping.sourceHeader}</td>
                    <td className="py-2 text-slate-600">
                      {String((rows[mappingPreviewIndex] ?? {})[mapping.sourceHeader] ?? "-")}
                    </td>
                    <td className="py-2">
                      <select
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                        value={mapping.targetField}
                        onChange={(event) => {
                          const targetField = event.target.value;
                          const metadata = activeConfig?.fields.find((field) => field.key === targetField);
                          setMappings((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    targetField,
                                    classification: metadata?.classification ?? item.classification,
                                    required: Boolean(metadata?.required)
                                  }
                                : item
                            )
                          );
                        }}
                      >
                        <option value="">-- Not Mapped --</option>
                        {(activeConfig?.fields ?? []).map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <select
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        value={mapping.classification}
                        onChange={(event) =>
                          setMappings((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, classification: event.target.value as FieldClassification }
                                : item
                            )
                          )
                        }
                      >
                        <option value="basic">Basic Field</option>
                        <option value="externalKey">External Key</option>
                        <option value="relationshipKey">Relationship Key</option>
                      </select>
                    </td>
                    <td className="py-2">{mapping.required ? "Yes" : "No"}</td>
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={mapping.ignore}
                        onChange={(event) =>
                          setMappings((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, ignore: event.target.checked } : item
                            )
                          )
                        }
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        value={mapping.transformRule}
                        placeholder="trim, upper, date"
                        onChange={(event) =>
                          setMappings((prev) =>
                            prev.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, transformRule: event.target.value } : item
                            )
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button type="button" onClick={() => setStep("relationships")}>
            Continue to Relationship Rules
          </Button>
        </section>
      ) : null}

      {step === "relationships" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          {(relationshipSettings.length === 0 ? activeConfig?.relationshipRules ?? [] : relationshipSettings).map(
            (rule, index) => (
              <div key={rule.key} className="grid gap-3 rounded-md border border-slate-200 p-3 md:grid-cols-5">
                <p className="text-sm font-medium md:col-span-5">{rule.key}</p>
                <div><label className="mb-1 block text-xs font-medium">Related Entity</label><Input value={rule.relatedEntity} disabled /></div>
                <div><label className="mb-1 block text-xs font-medium">Related Field</label><Input value={rule.relatedField} disabled /></div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Relationship Type</label>
                  <Input value={rule.relationshipType} disabled />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">If No Match</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    value={rule.ifNoMatch}
                    onChange={(event) =>
                      setRelationshipSettings((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, ifNoMatch: event.target.value as "error" | "skip" | "create_placeholder" }
                            : item
                        )
                      )
                    }
                  >
                    <option value="error">Error</option>
                    <option value="skip">Skip</option>
                    <option value="create_placeholder">Create Placeholder</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">If Multiple Matches</label>
                  <select
                    className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                    value={rule.ifMultipleMatches}
                    onChange={(event) =>
                      setRelationshipSettings((prev) =>
                        prev.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, ifMultipleMatches: event.target.value as "error" | "pick_first" | "hold_for_review" }
                            : item
                        )
                      )
                    }
                  >
                    <option value="error">Error</option>
                    <option value="pick_first">Pick First</option>
                    <option value="hold_for_review">Hold for Review</option>
                  </select>
                </div>
              </div>
            )
          )}
          {relationshipSettings.length === 0 ? (
            <p className="text-sm text-slate-600">This import type has no relationship-key rules.</p>
          ) : null}
          <Button type="button" onClick={() => void runValidation()} disabled={loading}>
            {loading ? "Validating..." : "Validate Import Data"}
          </Button>
        </section>
      ) : null}

      {step === "validate" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <p className="rounded-md bg-slate-100 px-3 py-2 text-sm">Valid: {validationSummary?.valid ?? 0}</p>
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm">Errors: {validationSummary?.errors ?? 0}</p>
            <p className="rounded-md bg-orange-50 px-3 py-2 text-sm">Unresolved Relationships: {validationSummary?.unresolvedRelationships ?? 0}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2">Row</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Errors</th>
                  <th className="py-2">Relationship Resolution</th>
                </tr>
              </thead>
              <tbody>
                {validationRows.map((row) => {
                  const status = String(row.row_status ?? "-");
                  const errors = Array.isArray(row.validation_errors) ? row.validation_errors : [];
                  const relationshipResolution = row.relationship_resolution ?? {};
                  return (
                    <tr key={String(row.id)} className="border-b border-slate-100">
                      <td className="py-2">{String(row.row_index ?? "-")}</td>
                      <td className="py-2">{status}</td>
                      <td className="py-2 text-xs text-red-700">{errors.length > 0 ? JSON.stringify(errors) : "-"}</td>
                      <td className="py-2 text-xs">{JSON.stringify(relationshipResolution)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button type="button" onClick={() => setStep("commit")}>Continue to Import Options</Button>
        </section>
      ) : null}

      {step === "commit" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Import Mode</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={importMode}
                onChange={(event) => setImportMode(event.target.value)}
              >
                {(importModes.length > 0 ? importModes : ["insert", "update", "upsert", "dry_run"]).map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Match By Fields</label>
              <Input value={matchByInput} onChange={(event) => setMatchByInput(event.target.value)} placeholder="external_source_id, email" />
            </div>
          </div>
          <Button type="button" onClick={() => void commitBatch()} disabled={!jobId || loading}>
            {loading ? "Committing..." : "Commit Import Batch"}
          </Button>
          {commitSummary ? <pre className="rounded-md bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(commitSummary, null, 2)}</pre> : null}
        </section>
      ) : null}

      {step === "results" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => (jobId ? void loadResults(jobId) : undefined)} disabled={!jobId}>
              Refresh Results
            </Button>
            <Button type="button" onClick={() => void rollbackBatch()} disabled={!jobId || loading}>
              {loading ? "Rolling Back..." : "Rollback Batch"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2">Row</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Committed Entity Type</th>
                  <th className="py-2">Committed Entity ID</th>
                </tr>
              </thead>
              <tbody>
                {resultRows.map((row) => (
                  <tr key={String(row.id)} className="border-b border-slate-100">
                    <td className="py-2">{String(row.row_index ?? "-")}</td>
                    <td className="py-2">{String(row.row_status ?? "-")}</td>
                    <td className="py-2">{String(row.committed_entity_type ?? "-")}</td>
                    <td className="py-2">{String(row.committed_entity_id ?? "-")}</td>
                  </tr>
                ))}
                {resultRows.length === 0 ? (
                  <tr>
                    <td className="py-3 text-sm text-slate-500" colSpan={4}>
                      No results loaded yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {previewRows.length > 0 && step !== "results" ? (
        <section className="rounded-md border border-slate-200 p-4">
          <p className="mb-2 text-sm font-semibold">File Preview</p>
          <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
            {JSON.stringify(previewRows, null, 2)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
