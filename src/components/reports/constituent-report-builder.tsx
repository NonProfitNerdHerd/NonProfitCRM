"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ReportMode = "constituent" | "transaction" | "project";
type BuilderStep = "filters" | "fields" | "build";
type RowRecord = Record<string, unknown>;

type ReportColumn = {
  key: string;
  label: string;
};

type ReportFilter = {
  key: string;
  label: string;
  options?: Array<{ label: string; value: string }>;
};

type MetadataPayload = {
  activeDefinition: {
    columns: ReportColumn[];
    filters: ReportFilter[];
    defaultColumns: string[];
  };
  capabilities?: {
    canExportCsv?: boolean;
    canExportExcel?: boolean;
  };
};

const previewColumnOrder = [
  "name",
  "entityType",
  "trackingStatus",
  "city",
  "state",
  "tagList",
  "membershipStatus",
  "taskStatuses",
  "campaignList"
] as const;

export function ConstituentReportBuilder() {
  const [reportMode, setReportMode] = useState<ReportMode>("constituent");
  const [step, setStep] = useState<BuilderStep>("filters");
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingBuild, setLoadingBuild] = useState(false);
  const [buildReady, setBuildReady] = useState(false);
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [metadata, setMetadata] = useState<MetadataPayload | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [canExportCsv, setCanExportCsv] = useState(true);
  const [canExportExcel, setCanExportExcel] = useState(true);
  const [csvDownloadUrl, setCsvDownloadUrl] = useState<string | null>(null);
  const [excelDownloadUrl, setExcelDownloadUrl] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    entityType: "",
    trackingStatus: "",
    city: "",
    state: "",
    tagContains: "",
    taskStatus: "",
    membershipStatus: "",
    campaignContains: ""
  });

  const availableColumns = metadata?.activeDefinition.columns ?? [];
  const columnLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const column of availableColumns) map.set(column.key, column.label);
    return map;
  }, [availableColumns]);
  const previewColumns = useMemo(() => {
    const allowed = new Set(availableColumns.map((column) => column.key));
    return previewColumnOrder.filter((column) => allowed.has(column));
  }, [availableColumns]);
  const filterMap = useMemo(() => {
    const map = new Map<string, ReportFilter>();
    for (const filter of metadata?.activeDefinition.filters ?? []) map.set(filter.key, filter);
    return map;
  }, [metadata?.activeDefinition.filters]);

  const filtersPayload = useMemo(
    () => ({
      entityType: filters.entityType || undefined,
      trackingStatus: filters.trackingStatus || undefined,
      city: filters.city || undefined,
      state: filters.state || undefined,
      tagContains: filters.tagContains || undefined,
      taskStatus: filters.taskStatus || undefined,
      membershipStatus: filters.membershipStatus || undefined,
      campaignContains: filters.campaignContains || undefined
    }),
    [filters]
  );

  async function loadMetadata() {
    setError(null);
    const response = await fetch("/api/reports/fields?reportType=contacts");
    const payload = (await response.json().catch(() => null)) as MetadataPayload | null;
    if (!response.ok || !payload?.activeDefinition) {
      setError("Unable to load report metadata.");
      return;
    }
    setMetadata(payload);
    setSelectedFields(payload.activeDefinition.defaultColumns ?? []);
    setCanExportCsv(Boolean(payload.capabilities?.canExportCsv));
    setCanExportExcel(Boolean(payload.capabilities?.canExportExcel));
  }

  async function loadPreview(targetPage = page, targetPageSize = pageSize) {
    if (reportMode !== "constituent") return;
    if (previewColumns.length === 0) return;
    setLoadingPreview(true);
    setError(null);
    try {
      const response = await fetch("/api/reports/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reportType: "contacts",
          selectedColumns: previewColumns,
          filters: filtersPayload,
          page: targetPage,
          pageSize: targetPageSize
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to run report.");
      }
      setRows((payload?.rows ?? []) as RowRecord[]);
      setTotalCount(Number(payload?.totalCount ?? 0));
      setPage(Number(payload?.page ?? targetPage));
      setPageCount(Number(payload?.pageCount ?? 1));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to run report.");
    } finally {
      setLoadingPreview(false);
    }
  }

  function revokePreparedDownloads() {
    if (csvDownloadUrl) URL.revokeObjectURL(csvDownloadUrl);
    if (excelDownloadUrl) URL.revokeObjectURL(excelDownloadUrl);
    setCsvDownloadUrl(null);
    setExcelDownloadUrl(null);
  }

  async function buildExportBlob(format: "csv" | "excel") {
    const response = await fetch("/api/reports/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportType: "contacts",
        selectedColumns: selectedFields,
        filters: filtersPayload,
        format
      })
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.message ?? "Unable to export report.");
    }
    return response.blob();
  }

  function downloadPreparedFile(format: "csv" | "excel") {
    const url = format === "csv" ? csvDownloadUrl : excelDownloadUrl;
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = `constituent-report.${format === "csv" ? "csv" : "xlsx"}`;
    link.click();
  }

  async function prepareBuildStep() {
    if (selectedFields.length === 0) {
      setError("Select at least one field before building the report.");
      return;
    }
    setError(null);
    setStep("build");
    setBuildReady(false);
    setLoadingBuild(true);
    revokePreparedDownloads();
    try {
      if (canExportCsv) {
        const csvBlob = await buildExportBlob("csv");
        setCsvDownloadUrl(URL.createObjectURL(csvBlob));
      }
      if (canExportExcel) {
        const excelBlob = await buildExportBlob("excel");
        setExcelDownloadUrl(URL.createObjectURL(excelBlob));
      }
      setBuildReady(true);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "Unable to build report.");
    } finally {
      setLoadingBuild(false);
    }
  }

  function toggleField(fieldKey: string) {
    setSelectedFields((prev) =>
      prev.includes(fieldKey) ? prev.filter((entry) => entry !== fieldKey) : [...prev, fieldKey]
    );
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedFields(availableColumns.map((column) => column.key));
      return;
    }
    setSelectedFields([]);
  }

  useEffect(() => {
    void loadMetadata();
  }, []);

  useEffect(() => {
    if (!metadata || reportMode !== "constituent") return;
    void loadPreview(1, pageSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata, reportMode]);

  useEffect(() => {
    return () => {
      if (csvDownloadUrl) URL.revokeObjectURL(csvDownloadUrl);
      if (excelDownloadUrl) URL.revokeObjectURL(excelDownloadUrl);
    };
  }, [csvDownloadUrl, excelDownloadUrl]);

  const isAllFieldsSelected =
    availableColumns.length > 0 && selectedFields.length === availableColumns.length;
  const membershipOptions = filterMap.get("membershipStatus")?.options ?? [];
  const recordTypeOptions = filterMap.get("entityType")?.options ?? [];
  const trackingOptions = filterMap.get("trackingStatus")?.options ?? [];
  const taskStatusOptions = filterMap.get("taskStatus")?.options ?? [];

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">Report Builder</h3>
        <p className="text-sm text-slate-600">
          Build constituent reports through a guided 3-step workflow.
        </p>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {step === "filters" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Step 1: Choose Report Type</p>
            <div className="grid gap-2 md:grid-cols-3">
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  reportMode === "constituent"
                    ? "border-brand-300 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => setReportMode("constituent")}
              >
                Constituent Report
              </button>
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  reportMode === "transaction"
                    ? "border-brand-300 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => setReportMode("transaction")}
              >
                Transaction Report
              </button>
              <button
                type="button"
                className={`rounded-md border px-3 py-2 text-left text-sm ${
                  reportMode === "project"
                    ? "border-brand-300 bg-brand-50 text-brand-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => setReportMode("project")}
              >
                Project Report
              </button>
            </div>
          </div>

          {reportMode !== "constituent" ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              {reportMode === "transaction" ? "Transaction Report" : "Project Report"} steps will be
              configured next.
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">Constituent Filters</p>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Record Type</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={filters.entityType}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, entityType: event.target.value }))
                      }
                    >
                      <option value="">All</option>
                      {recordTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Tracking Status
                    </label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={filters.trackingStatus}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, trackingStatus: event.target.value }))
                      }
                    >
                      <option value="">All</option>
                      {trackingOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">City</label>
                    <Input
                      value={filters.city}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, city: event.target.value }))
                      }
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">State</label>
                    <Input
                      value={filters.state}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, state: event.target.value }))
                      }
                      placeholder="State"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Tags</label>
                    <Input
                      value={filters.tagContains}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, tagContains: event.target.value }))
                      }
                      placeholder="Tag contains..."
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Tasks by Status
                    </label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={filters.taskStatus}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, taskStatus: event.target.value }))
                      }
                    >
                      <option value="">All</option>
                      {taskStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Memberships</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={filters.membershipStatus}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, membershipStatus: event.target.value }))
                      }
                    >
                      <option value="">All</option>
                      {membershipOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Campaigns</label>
                    <Input
                      value={filters.campaignContains}
                      onChange={(event) =>
                        setFilters((prev) => ({ ...prev, campaignContains: event.target.value }))
                      }
                      placeholder="Campaign contains..."
                    />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => void loadPreview(1, pageSize)}>
                    {loadingPreview ? "Running..." : "Apply Filters"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setFilters({
                        entityType: "",
                        trackingStatus: "",
                        city: "",
                        state: "",
                        tagContains: "",
                        taskStatus: "",
                        membershipStatus: "",
                        campaignContains: ""
                      });
                      void loadPreview(1, pageSize);
                    }}
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>

              <div className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">
                    Constituents ({totalCount.toLocaleString()})
                  </p>
                  <Button type="button" onClick={() => setStep("fields")}>
                    Run Report and Download
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {previewColumns.map((column) => (
                          <th
                            key={column}
                            className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                          >
                            {columnLabelMap.get(column) ?? column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {rows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={previewColumns.length || 1}
                            className="px-3 py-4 text-center text-sm text-slate-500"
                          >
                            {loadingPreview ? "Loading results..." : "No contacts matched current filters."}
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, rowIndex) => (
                          <tr key={`row-${rowIndex}`}>
                            {previewColumns.map((column) => (
                              <td key={`${rowIndex}-${column}`} className="px-3 py-2 text-slate-700">
                                {String(row[column] ?? "-")}
                              </td>
                            ))}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">Rows:</span>
                    <select
                      className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                      value={pageSize}
                      onChange={(event) => {
                        const nextPageSize = Number(event.target.value);
                        setPageSize(nextPageSize);
                        void loadPreview(1, nextPageSize);
                      }}
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={page <= 1 || loadingPreview}
                      onClick={() => void loadPreview(Math.max(1, page - 1), pageSize)}
                    >
                      Prev
                    </Button>
                    <span className="text-xs text-slate-600">
                      Page {page} of {pageCount}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={page >= pageCount || loadingPreview}
                      onClick={() => void loadPreview(Math.min(pageCount, page + 1), pageSize)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      ) : null}

      {step === "fields" ? (
        <section className="space-y-3 rounded-md border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">
            Step 2: Select the fields you would like to include in this report
          </p>
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={isAllFieldsSelected}
              onChange={(event) => toggleSelectAll(event.target.checked)}
            />
            Select All
          </label>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {availableColumns.map((column) => (
              <label key={column.key} className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedFields.includes(column.key)}
                  onChange={() => toggleField(column.key)}
                />
                {column.label}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep("filters")}>
              Back to Filters
            </Button>
            <Button type="button" onClick={() => void prepareBuildStep()} disabled={selectedFields.length === 0}>
              Build Report
            </Button>
          </div>
        </section>
      ) : null}

      {step === "build" ? (
        <section className="rounded-md border border-slate-200 p-8">
          <div className="mx-auto flex max-w-xl flex-col items-center justify-center text-center">
            {loadingBuild ? (
              <>
                <p className="text-2xl font-semibold text-slate-900">
                  Please wait as your report is being built
                </p>
                <div className="mt-3 flex items-center gap-1 text-2xl text-brand-600">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce [animation-delay:120ms]">.</span>
                  <span className="animate-bounce [animation-delay:240ms]">.</span>
                </div>
              </>
            ) : buildReady ? (
              <>
                <p className="text-2xl font-semibold text-slate-900">Your report is ready</p>
                <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                  {canExportExcel ? (
                    <Button type="button" onClick={() => downloadPreparedFile("excel")}>
                      Download Excel
                    </Button>
                  ) : null}
                  {canExportCsv ? (
                    <Button type="button" variant="secondary" onClick={() => downloadPreparedFile("csv")}>
                      Download CSV
                    </Button>
                  ) : null}
                </div>
                <Button className="mt-3" type="button" variant="secondary" onClick={() => setStep("fields")}>
                  Back to Field Selection
                </Button>
              </>
            ) : (
              <p className="text-sm text-slate-600">Preparing report...</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
