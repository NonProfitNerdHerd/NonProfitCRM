"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { type ReportType } from "@/lib/reports/config";

type StepKey = "fields" | "filters" | "run";

type ReportColumn = {
  key: string;
  label: string;
  sortable?: boolean;
  dataType?: "text" | "number" | "date" | "currency";
};

type ReportFilter = {
  key: string;
  label: string;
  type: "text" | "select" | "date" | "number";
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
};

type ReportDefinitionPayload = {
  key: ReportType;
  label: string;
  description: string;
  columns: ReportColumn[];
  filters: ReportFilter[];
  defaultColumns: string[];
  defaultSort: { field: string; direction: "asc" | "desc" };
};

type SavedReport = {
  id: string;
  name: string;
  description: string;
  reportType: ReportType;
  selectedColumns: string[];
  filters: Record<string, unknown>;
  sort: { field: string; direction: "asc" | "desc" } | null;
};

const stepItems: Array<{ key: StepKey; label: string }> = [
  { key: "fields", label: "Step 1 Select Fields" },
  { key: "filters", label: "Step 2 Select Filters" },
  { key: "run", label: "Step 3 Run Report" }
];

export function ReportBuilder({
  initialReportType,
  hideReportTypeSelector = false,
  initialSavedReportId,
  title,
  subtitle
}: {
  initialReportType?: ReportType;
  hideReportTypeSelector?: boolean;
  initialSavedReportId?: string;
  title?: string;
  subtitle?: string;
}) {
  const [step, setStep] = useState<StepKey>("fields");
  const [reportType, setReportType] = useState<ReportType>(initialReportType ?? "contacts");
  const [availableReportTypes, setAvailableReportTypes] = useState<
    Array<{ key: ReportType; label: string }>
  >([]);
  const [definition, setDefinition] = useState<ReportDefinitionPayload | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" } | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedReportName, setSavedReportName] = useState("");
  const [savedReportDescription, setSavedReportDescription] = useState("");
  const [activeSavedReportId, setActiveSavedReportId] = useState<string | null>(null);
  const [canBuildReports, setCanBuildReports] = useState(false);
  const [canExportCsv, setCanExportCsv] = useState(false);
  const [canExportExcel, setCanExportExcel] = useState(false);

  const columnMap = useMemo(() => {
    const map = new Map<string, ReportColumn>();
    for (const column of definition?.columns ?? []) map.set(column.key, column);
    return map;
  }, [definition?.columns]);

  async function loadDefinition(nextType?: ReportType) {
    setError(null);
    const targetType = nextType ?? reportType;
    const response = await fetch(`/api/reports/fields?reportType=${targetType}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load report metadata.");
      return;
    }

    const activeDefinition = payload.activeDefinition as ReportDefinitionPayload;
    const availableTypes = (payload.availableReportTypes ?? []) as Array<{
      key: ReportType;
      label: string;
    }>;
    setDefinition(activeDefinition);
    setAvailableReportTypes(availableTypes);
    setReportType(activeDefinition.key);
    setSelectedColumns(activeDefinition.defaultColumns);
    setFilters({});
    setSort(activeDefinition.defaultSort);
    setRows([]);
    setPage(1);
    setPageCount(1);
    setTotalCount(0);
    setCanBuildReports(Boolean(payload.capabilities?.canBuildReports));
    setCanExportCsv(Boolean(payload.capabilities?.canExportCsv));
    setCanExportExcel(Boolean(payload.capabilities?.canExportExcel));
  }

  useEffect(() => {
    void loadDefinition(initialReportType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initialSavedReportId) return;
    if (!definition) return;
    void openSavedReport(initialSavedReportId, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  async function runReport(targetPage = page) {
    if (!definition || selectedColumns.length === 0) return;
    setLoading(true);
    setError(null);
    const response = await fetch("/api/reports/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportType,
        selectedColumns,
        filters,
        sort,
        page: targetPage,
        pageSize
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to run report.");
      setLoading(false);
      return;
    }

    setRows((payload?.rows ?? []) as Record<string, unknown>[]);
    setTotalCount(Number(payload?.totalCount ?? 0));
    setPage(Number(payload?.page ?? targetPage));
    setPageCount(Number(payload?.pageCount ?? 1));
    setLoading(false);
  }

  async function openSavedReport(savedReportId: string, runImmediately = false) {
    const response = await fetch(`/api/reports/saved/${savedReportId}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load saved report.");
      return;
    }
    const report = payload.report as SavedReport;
    if (report.reportType !== reportType) {
      await loadDefinition(report.reportType);
    }
    setActiveSavedReportId(report.id);
    setSavedReportName(report.name);
    setSavedReportDescription(report.description ?? "");
    setSelectedColumns(report.selectedColumns);
    setFilters(report.filters ?? {});
    setSort(report.sort ?? definition?.defaultSort ?? null);
    setStep("run");
    if (runImmediately) {
      await runSavedReport(report.id, 1);
    }
  }

  async function runSavedReport(savedReportId: string, targetPage = page) {
    const response = await fetch(
      `/api/reports/saved/${savedReportId}/run?page=${targetPage}&pageSize=${pageSize}`,
      { method: "POST" }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to run saved report.");
      return;
    }
    setRows((payload?.rows ?? []) as Record<string, unknown>[]);
    setTotalCount(Number(payload?.totalCount ?? 0));
    setPage(Number(payload?.page ?? targetPage));
    setPageCount(Number(payload?.pageCount ?? 1));
  }

  async function saveReport(saveAsNew = false) {
    if (!canBuildReports) return;
    if (!savedReportName.trim()) {
      setError("Report Name is required.");
      return;
    }
    const response = await fetch("/api/reports/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: activeSavedReportId ?? undefined,
        saveAsNew,
        name: savedReportName.trim(),
        description: savedReportDescription.trim(),
        reportType,
        selectedColumns,
        filters,
        sort
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to save report.");
      return;
    }
    setActiveSavedReportId(String(payload?.id ?? ""));
  }

  async function exportReport(format: "csv" | "excel") {
    if (!definition || selectedColumns.length === 0) return;
    const response = await fetch("/api/reports/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportType,
        selectedColumns,
        filters,
        sort,
        format
      })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.message ?? "Unable to export report.");
      return;
    }
    const blob = await response.blob();
    const fileUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = `${reportType}-report.${format === "csv" ? "csv" : "xlsx"}`;
    a.click();
    URL.revokeObjectURL(fileUrl);
  }

  function resetFilters() {
    setFilters({});
  }

  function renderFilterInput(filter: ReportFilter) {
    const value = String(filters[filter.key] ?? "");
    if (filter.type === "select") {
      return (
        <select
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          value={value}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, [filter.key]: event.target.value }))
          }
        >
          <option value="">All</option>
          {(filter.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    if (filter.type === "date") {
      return (
        <Input
          type="date"
          value={value}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, [filter.key]: event.target.value }))
          }
        />
      );
    }
    if (filter.type === "number") {
      return (
        <Input
          type="number"
          value={value}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, [filter.key]: event.target.value }))
          }
          placeholder={filter.placeholder}
        />
      );
    }
    return (
      <Input
        value={value}
        onChange={(event) =>
          setFilters((prev) => ({ ...prev, [filter.key]: event.target.value }))
        }
        placeholder={filter.placeholder}
      />
    );
  }

  function formatCellValue(columnKey: string, value: unknown) {
    const column = columnMap.get(columnKey);
    if (value === null || value === undefined || value === "") return "-";
    if (column?.dataType === "currency") return formatCurrency(Number(value));
    if (column?.dataType === "date") return formatDate(String(value));
    return String(value);
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">
          {title ?? "Guided Report Builder"}
        </h3>
        <p className="text-sm text-slate-600">
          {subtitle ?? "Build and run reports through a structured step-by-step workflow."}
        </p>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {stepItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStep(item.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                step === item.key
                  ? "border-brand-200 bg-brand-100 text-brand-800"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <div className="grid gap-3 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Report Name</label>
              <Input
                value={savedReportName}
                onChange={(event) => setSavedReportName(event.target.value)}
                placeholder="Name this report"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
              <Input
                value={savedReportDescription}
                onChange={(event) => setSavedReportDescription(event.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" disabled={!canBuildReports} onClick={() => void saveReport(false)}>
                Save Report
              </Button>
              {activeSavedReportId ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!canBuildReports}
                  onClick={() => void saveReport(true)}
                >
                  Save As New
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {step === "fields" ? (
          <div className="mt-3 space-y-3">
            {!hideReportTypeSelector ? (
              <div className="max-w-sm">
                <label className="mb-1 block text-xs font-medium text-slate-600">Report Type</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={reportType}
                  onChange={(event) => void loadDefinition(event.target.value as ReportType)}
                >
                  {availableReportTypes.map((type) => (
                    <option key={type.key} value={type.key}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(definition?.columns ?? []).map((column) => (
                <label key={column.key} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedColumns.includes(column.key)}
                    onChange={() =>
                      setSelectedColumns((prev) =>
                        prev.includes(column.key)
                          ? prev.filter((key) => key !== column.key)
                          : [...prev, column.key]
                      )
                    }
                  />
                  {column.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === "filters" ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(definition?.filters ?? []).map((filter) => (
                <div key={filter.key}>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    {filter.label}
                  </label>
                  {renderFilterInput(filter)}
                </div>
              ))}
            </div>
            <Button type="button" variant="secondary" onClick={resetFilters}>
              Reset Filters
            </Button>
          </div>
        ) : null}

        {step === "run" ? (
          <div className="mt-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Sort Field</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={sort?.field ?? ""}
                  onChange={(event) =>
                    setSort((prev) => ({
                      field: event.target.value,
                      direction: prev?.direction ?? "asc"
                    }))
                  }
                >
                  <option value="">Select</option>
                  {(definition?.columns ?? [])
                    .filter((column) => column.sortable !== false)
                    .map((column) => (
                      <option key={column.key} value={column.key}>
                        {column.label}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Sort Direction</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={sort?.direction ?? "asc"}
                  onChange={(event) =>
                    setSort((prev) => ({
                      field: prev?.field ?? definition?.defaultSort.field ?? "",
                      direction: event.target.value as "asc" | "desc"
                    }))
                  }
                >
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Page Size</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={String(pageSize)}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  type="button"
                  onClick={() => void runReport(1)}
                  disabled={loading || selectedColumns.length === 0}
                >
                  {loading ? "Running..." : "Run Report"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!canExportCsv || selectedColumns.length === 0}
                onClick={() => void exportReport("csv")}
              >
                Export to CSV
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!canExportExcel || selectedColumns.length === 0}
                onClick={() => void exportReport("excel")}
              >
                Export to Excel
              </Button>
              {activeSavedReportId ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void runSavedReport(activeSavedReportId, 1)}
                >
                  Re-run Saved Report
                </Button>
              ) : null}
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Results Table</p>
                <p className="text-xs text-slate-500">Total Results: {totalCount}</p>
              </div>
              {rows.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No results yet. Run report to view the output table.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-600">
                          {selectedColumns.map((column) => (
                            <th key={column} className="py-2 pr-3">
                              {columnMap.get(column)?.label ?? column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row, index) => (
                          <tr key={index} className="border-b border-slate-100">
                            {selectedColumns.map((column) => (
                              <td key={column} className="py-2 pr-3">
                                {formatCellValue(column, row[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3 flex items-center justify-center gap-3">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={page <= 1}
                        onClick={() => void runReport(page - 1)}
                      >
                        Previous
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={page >= pageCount}
                        onClick={() => void runReport(page + 1)}
                      >
                        Next
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Page {page} of {pageCount}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            const index = stepItems.findIndex((item) => item.key === step);
            if (index > 0) setStep(stepItems[index - 1].key);
          }}
          disabled={step === "fields"}
        >
          Previous Step
        </Button>
        <Button
          type="button"
          onClick={() => {
            const index = stepItems.findIndex((item) => item.key === step);
            if (index < stepItems.length - 1) setStep(stepItems[index + 1].key);
          }}
          disabled={step === "run"}
        >
          Next Step
        </Button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
