"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";
import { type ReportType } from "@/lib/reports/config";

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
  updatedAt: string;
};

export function ReportBuilder({
  initialReportType,
  title,
  subtitle
}: {
  initialReportType?: ReportType;
  title?: string;
  subtitle?: string;
}) {
  const [reportType, setReportType] = useState<ReportType>(initialReportType ?? "contacts");
  const [availableReportTypes, setAvailableReportTypes] = useState<
    Array<{ key: ReportType; label: string; description: string }>
  >([]);
  const [definition, setDefinition] = useState<ReportDefinitionPayload | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [sort, setSort] = useState<{ field: string; direction: "asc" | "desc" } | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [pageCount, setPageCount] = useState(1);

  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [activeSavedReportId, setActiveSavedReportId] = useState<string | null>(null);
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");

  const [canBuildReports, setCanBuildReports] = useState(false);
  const [canExportCsv, setCanExportCsv] = useState(false);
  const [canExportExcel, setCanExportExcel] = useState(false);

  async function loadDefinition(nextType?: ReportType) {
    setError(null);
    const targetType = nextType ?? reportType;
    const response = await fetch(`/api/reports/fields?reportType=${targetType}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load report metadata.");
      return;
    }

    const active = payload.activeDefinition as ReportDefinitionPayload;
    setAvailableReportTypes(payload.availableReportTypes ?? []);
    setDefinition(active);
    setReportType(active.key);
    setSelectedColumns(active.defaultColumns ?? []);
    setSort(active.defaultSort ?? null);
    setFilters({});
    setRows([]);
    setPage(1);
    setTotalCount(0);
    setPageCount(1);
    setActiveSavedReportId(null);
    setReportName("");
    setReportDescription("");
    setCanBuildReports(Boolean(payload.capabilities?.canBuildReports));
    setCanExportCsv(Boolean(payload.capabilities?.canExportCsv));
    setCanExportExcel(Boolean(payload.capabilities?.canExportExcel));

    await loadSavedReports(active.key);
  }

  async function loadSavedReports(type: ReportType) {
    const response = await fetch(`/api/reports/saved?reportType=${type}`);
    const payload = await response.json().catch(() => null);
    if (response.ok) setSavedReports((payload?.reports ?? []) as SavedReport[]);
  }

  useEffect(() => {
    void loadDefinition(initialReportType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const columnMap = useMemo(() => {
    const map = new Map<string, ReportColumn>();
    for (const column of definition?.columns ?? []) {
      map.set(column.key, column);
    }
    return map;
  }, [definition?.columns]);

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

  function resetFilters() {
    setFilters({});
    setPage(1);
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
    const anchor = document.createElement("a");
    anchor.href = fileUrl;
    anchor.download = `${reportType}-report.${format === "csv" ? "csv" : "xlsx"}`;
    anchor.click();
    URL.revokeObjectURL(fileUrl);
  }

  async function saveReport(saveAsNew = false) {
    if (!canBuildReports) return;
    if (!reportName.trim()) {
      setError("Report Name is required.");
      return;
    }
    const response = await fetch("/api/reports/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: activeSavedReportId ?? undefined,
        saveAsNew,
        name: reportName.trim(),
        description: reportDescription.trim(),
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
    await loadSavedReports(reportType);
  }

  async function openSavedReport(savedReport: SavedReport) {
    const response = await fetch(`/api/reports/saved/${savedReport.id}`);
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
    setReportName(report.name);
    setReportDescription(report.description ?? "");
    setSelectedColumns(report.selectedColumns);
    setFilters((report.filters ?? {}) as Record<string, unknown>);
    setSort((report.sort as { field: string; direction: "asc" | "desc" } | null) ?? null);
    setPage(1);
    await runSavedReport(report.id, 1);
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

  async function renameSavedReport(savedReportId: string) {
    const nextName = window.prompt("New report name");
    if (!nextName?.trim()) return;
    const response = await fetch(`/api/reports/saved/${savedReportId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: nextName.trim() })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to rename report.");
      return;
    }
    if (activeSavedReportId === savedReportId) {
      setReportName(nextName.trim());
    }
    await loadSavedReports(reportType);
  }

  async function deleteSavedReport(savedReportId: string) {
    if (!window.confirm("Delete this saved report?")) return;
    const response = await fetch(`/api/reports/saved/${savedReportId}`, {
      method: "DELETE"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to delete report.");
      return;
    }
    if (activeSavedReportId === savedReportId) {
      setActiveSavedReportId(null);
      setReportName("");
      setReportDescription("");
    }
    await loadSavedReports(reportType);
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

  function formatCellValue(column: ReportColumn | undefined, value: unknown) {
    if (value === null || value === undefined || value === "") return "-";
    if (column?.dataType === "currency") return formatCurrency(Number(value));
    if (column?.dataType === "date") return formatDate(String(value));
    return String(value);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">
          {title ?? "Unified Report Builder"}
        </h3>
        <p className="text-sm text-slate-600">
          {subtitle ??
            "Configure columns, filters, sorting, and exports for operational CRM reports."}
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <section className="space-y-4 rounded-md border border-slate-200 p-4 xl:col-span-3">
          <div className="grid gap-3 lg:grid-cols-4">
            <div>
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
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Column / Field Selector</p>
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

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-900">Filter Panel</p>
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
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void runReport(1)} disabled={loading || selectedColumns.length === 0}>
              {loading ? "Running..." : "Run Report"}
            </Button>
            <Button type="button" variant="secondary" onClick={resetFilters}>
              Reset Filters
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!canExportCsv || selectedColumns.length === 0}
              onClick={() => void exportReport("csv")}
            >
              Export CSV
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!canExportExcel || selectedColumns.length === 0}
              onClick={() => void exportReport("excel")}
            >
              Export Excel
            </Button>
          </div>
        </section>

        <aside className="space-y-3 rounded-md border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Saved Reports</p>
          <Input
            placeholder="Report Name"
            value={reportName}
            onChange={(event) => setReportName(event.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={reportDescription}
            onChange={(event) => setReportDescription(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
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
          <div className="max-h-96 space-y-2 overflow-auto">
            {savedReports.length === 0 ? (
              <p className="text-xs text-slate-500">No saved reports yet.</p>
            ) : (
              savedReports.map((savedReport) => (
                <div
                  key={savedReport.id}
                  className={`rounded-md border p-2 ${
                    activeSavedReportId === savedReport.id
                      ? "border-brand-300 bg-brand-50"
                      : "border-slate-200"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-900">{savedReport.name}</p>
                  <p className="text-xs text-slate-500">{formatDate(savedReport.updatedAt)}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => void openSavedReport(savedReport)}
                    >
                      Open
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => void runSavedReport(savedReport.id, 1)}
                    >
                      Run
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => void renameSavedReport(savedReport.id)}
                      disabled={!canBuildReports}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      className="px-2 py-1 text-xs"
                      onClick={() => void deleteSavedReport(savedReport.id)}
                      disabled={!canBuildReports}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-slate-200 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">Report Results</p>
          <p className="text-xs text-slate-500">Total Results: {totalCount}</p>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No results yet. Run a report to view data.</p>
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
                          {formatCellValue(columnMap.get(column), row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Page {page} of {pageCount}
              </p>
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
            </div>
          </>
        )}
      </section>
    </div>
  );
}
