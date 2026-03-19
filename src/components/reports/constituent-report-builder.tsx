"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagMultiSelectAutocomplete, type TagMultiSelectOption } from "@/components/tags/tag-multi-select-autocomplete";
import { searchTagAutocompleteOptions } from "@/lib/tags/tag-autocomplete-client";

type ReportMode = "constituent" | "transaction" | "project";
type BuilderStep = "filters" | "fields" | "activities" | "downloads";
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
  "taskStatuses"
] as const;

export function ConstituentReportBuilder() {
  const [reportMode, setReportMode] = useState<ReportMode>("constituent");
  const [step, setStep] = useState<BuilderStep>("filters");
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingBuild, setLoadingBuild] = useState(false);
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [metadata, setMetadata] = useState<MetadataPayload | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [canExportCsv, setCanExportCsv] = useState(true);
  const [canExportExcel, setCanExportExcel] = useState(true);
  const [selectedTags, setSelectedTags] = useState<TagMultiSelectOption[]>([]);
  const [includeActivitiesReport, setIncludeActivitiesReport] = useState<"yes" | "no">("no");
  const [includeLetterMailer, setIncludeLetterMailer] = useState<"yes" | "no">("no");
  const [includeLabelMailer, setIncludeLabelMailer] = useState<"yes" | "no">("no");
  const [downloadOptions, setDownloadOptions] = useState({
    exportCsv: true,
    exportExcel: true,
    activitiesPdf: false,
    letterMailer: false,
    labelMailer: false
  });
  const [preparedDownloads, setPreparedDownloads] = useState<
    Array<{ key: string; label: string; url: string; fileName: string }>
  >([]);
  const [filters, setFilters] = useState({
    entityType: "",
    trackingStatus: "",
    city: "",
    state: "",
    taskStatus: "",
    membershipStatus: ""
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
      tagIds: selectedTags.map((tag) => tag.id),
      taskStatus: filters.taskStatus || undefined,
      membershipStatus: filters.membershipStatus || undefined
    }),
    [filters, selectedTags]
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
    setDownloadOptions((prev) => ({
      ...prev,
      exportCsv: Boolean(payload.capabilities?.canExportCsv),
      exportExcel: Boolean(payload.capabilities?.canExportExcel)
    }));
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
    for (const item of preparedDownloads) {
      URL.revokeObjectURL(item.url);
    }
    setPreparedDownloads([]);
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

  async function buildActivityReportPdfBlob() {
    const response = await fetch("/api/reports/contacts/activities", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters: filtersPayload })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to build activities report.");
    }
    const rows = (payload?.rows ?? []) as Array<Record<string, unknown>>;
    const document = new jsPDF({ unit: "pt", format: "letter" });
    const pageHeight = document.internal.pageSize.getHeight();
    const marginLeft = 36;
    const marginTop = 42;
    const contentWidth = document.internal.pageSize.getWidth() - marginLeft * 2;
    let y = marginTop;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const name = String(row.name ?? "-");
      const phone = String(row.phone ?? "-");
      const email = String(row.email ?? "-");
      const address = String(row.address ?? "-");
      const activities = (Array.isArray(row.activities) ? row.activities : []) as Array<Record<string, unknown>>;

      const ensureSpace = (lineCount = 1) => {
        const requiredHeight = lineCount * 14;
        if (y + requiredHeight > pageHeight - 36) {
          document.addPage();
          y = marginTop;
        }
      };

      ensureSpace(4);
      document.setFont("helvetica", "bold");
      document.setFontSize(11);
      const headline = `${name}  •  ${phone}  •  ${email}`;
      const wrappedHeadline = document.splitTextToSize(headline, contentWidth);
      document.text(wrappedHeadline, marginLeft, y);
      y += wrappedHeadline.length * 14;
      document.setFont("helvetica", "normal");
      document.setFontSize(10);
      const wrappedAddress = document.splitTextToSize(`Address: ${address}`, contentWidth);
      document.text(wrappedAddress, marginLeft, y);
      y += wrappedAddress.length * 14;

      if (activities.length === 0) {
        ensureSpace(1);
        document.text(" - No activities found.", marginLeft + 8, y);
        y += 14;
      } else {
        for (const activity of activities) {
          const createdAt = String(activity.createdAt ?? "").slice(0, 10);
          const actionType = String(activity.actionType ?? "");
          const summary = String(activity.summary ?? "");
          const line = ` - ${createdAt} ${actionType ? `[${actionType}] ` : ""}${summary}`;
          const wrapped = document.splitTextToSize(line, contentWidth - 10);
          ensureSpace(wrapped.length);
          document.text(wrapped, marginLeft + 8, y);
          y += wrapped.length * 13;
        }
      }

      y += 8;
      ensureSpace(1);
      document.setDrawColor(203, 213, 225);
      document.line(marginLeft, y, marginLeft + contentWidth, y);
      y += 14;
    }

    return document.output("blob");
  }

  async function fetchFilteredConstituentsForMailer() {
    const response = await fetch("/api/reports/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportType: "contacts",
        selectedColumns: ["id", "name", "email", "phone", "address", "city", "state", "zip"],
        filters: filtersPayload,
        exportAll: true,
        recordRun: false
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to fetch filtered constituents.");
    }
    return (payload?.rows ?? []) as Array<Record<string, unknown>>;
  }

  async function buildLetterMailerBlob() {
    const rows = await fetchFilteredConstituentsForMailer();
    const letterHtml = [
      "<!doctype html>",
      "<html><head><meta charset=\"utf-8\" /><title>Letter Mailer</title>",
      "<style>",
      "body{font-family:Arial,sans-serif;margin:36px;color:#0f172a;}",
      ".letter{page-break-after:always;margin-bottom:40px;}",
      "h2{margin:0 0 8px;font-size:18px;}",
      "p{margin:0 0 8px;line-height:1.4;}",
      "</style></head><body>",
      ...rows.map((row) => {
        const address = [row.address, row.city, row.state, row.zip].map((value) => String(value ?? "").trim()).filter(Boolean).join(", ");
        return `<section class="letter">
          <h2>${String(row.name ?? "-")}</h2>
          <p>${address || "-"}</p>
          <p>Dear ${String(row.name ?? "Constituent")},</p>
          <p>Thank you for your continued support. We appreciate your partnership and wanted to share this update.</p>
          <p>Sincerely,<br/>Your Organization</p>
        </section>`;
      }),
      "</body></html>"
    ].join("\n");
    return new Blob([letterHtml], { type: "text/html" });
  }

  async function buildLabelMailerBlob() {
    const rows = await fetchFilteredConstituentsForMailer();
    const csvRows = [
      "Name,Address,City,State,Zip",
      ...rows.map((row) =>
        [
          JSON.stringify(String(row.name ?? "")),
          JSON.stringify(String(row.address ?? "")),
          JSON.stringify(String(row.city ?? "")),
          JSON.stringify(String(row.state ?? "")),
          JSON.stringify(String(row.zip ?? ""))
        ].join(",")
      )
    ];
    return new Blob([csvRows.join("\n")], { type: "text/csv" });
  }

  function downloadPreparedFile(item: { url: string; fileName: string }) {
    const link = document.createElement("a");
    link.href = item.url;
    link.download = item.fileName;
    link.click();
  }

  async function prepareSelectedDownloads() {
    const hasSelection = Object.values(downloadOptions).some(Boolean);
    if (!hasSelection) {
      setError("Select at least one report output to prepare.");
      return;
    }
    setError(null);
    setLoadingBuild(true);
    revokePreparedDownloads();
    const nextDownloads: Array<{ key: string; label: string; url: string; fileName: string }> = [];
    try {
      if (downloadOptions.exportCsv && canExportCsv) {
        const csvBlob = await buildExportBlob("csv");
        nextDownloads.push({
          key: "csv",
          label: "Simple Export (CSV)",
          url: URL.createObjectURL(csvBlob),
          fileName: "constituent-report.csv"
        });
      }
      if (downloadOptions.exportExcel && canExportExcel) {
        const excelBlob = await buildExportBlob("excel");
        nextDownloads.push({
          key: "excel",
          label: "Simple Export (Excel)",
          url: URL.createObjectURL(excelBlob),
          fileName: "constituent-report.xlsx"
        });
      }
      if (downloadOptions.activitiesPdf && includeActivitiesReport === "yes") {
        const activitiesBlob = await buildActivityReportPdfBlob();
        nextDownloads.push({
          key: "activities",
          label: "Activities Report (PDF)",
          url: URL.createObjectURL(activitiesBlob),
          fileName: "constituent-activities-report.pdf"
        });
      }
      if (downloadOptions.letterMailer && includeLetterMailer === "yes") {
        const letterBlob = await buildLetterMailerBlob();
        nextDownloads.push({
          key: "letter-mailer",
          label: "Letter Mailer",
          url: URL.createObjectURL(letterBlob),
          fileName: "constituent-letter-mailer.html"
        });
      }
      if (downloadOptions.labelMailer && includeLabelMailer === "yes") {
        const labelBlob = await buildLabelMailerBlob();
        nextDownloads.push({
          key: "label-mailer",
          label: "Label Mailer",
          url: URL.createObjectURL(labelBlob),
          fileName: "constituent-label-mailer.csv"
        });
      }
      setPreparedDownloads(nextDownloads);
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
      for (const item of preparedDownloads) {
        URL.revokeObjectURL(item.url);
      }
    };
  }, [preparedDownloads]);

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
          Build constituent reports through a guided workflow.
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
                    <TagMultiSelectAutocomplete
                      selected={selectedTags}
                      onChange={setSelectedTags}
                      placeholder="Start typing tag names..."
                      emptyHint="No matching tags."
                      loadOptions={(query) =>
                        searchTagAutocompleteOptions({
                          query,
                          module: "contacts",
                          activeOnly: true,
                          limit: 20
                        })
                      }
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
                        taskStatus: "",
                        membershipStatus: ""
                      });
                      setSelectedTags([]);
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
            <Button type="button" onClick={() => setStep("activities")} disabled={selectedFields.length === 0}>
              Next Step
            </Button>
          </div>
        </section>
      ) : null}

      {step === "activities" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">
            Step 3: Include an Activities Report as well?
          </p>
          <div className="flex gap-3">
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="include-activities-report"
                checked={includeActivitiesReport === "yes"}
                onChange={() => setIncludeActivitiesReport("yes")}
              />
              Yes
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="include-activities-report"
                checked={includeActivitiesReport === "no"}
                onChange={() => setIncludeActivitiesReport("no")}
              />
              No
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep("fields")}>
              Back to Fields
            </Button>
            <Button type="button" onClick={() => setStep("downloads")}>
              Continue to Step 4
            </Button>
          </div>
        </section>
      ) : null}

      {step === "downloads" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">
            Step 4: Download and Mailer Options
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-slate-800">
                Would you like letters and labels printed for a mailer?
              </p>
              <p className="mb-1 text-xs font-medium text-slate-600">Ask for Letter</p>
              <div className="mb-3 flex gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="include-letter-mailer"
                    checked={includeLetterMailer === "yes"}
                    onChange={() => {
                      setIncludeLetterMailer("yes");
                      setDownloadOptions((prev) => ({ ...prev, letterMailer: true }));
                    }}
                  />
                  Yes
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="include-letter-mailer"
                    checked={includeLetterMailer === "no"}
                    onChange={() => {
                      setIncludeLetterMailer("no");
                      setDownloadOptions((prev) => ({ ...prev, letterMailer: false }));
                    }}
                  />
                  No
                </label>
              </div>
              <p className="mb-1 text-xs font-medium text-slate-600">Ask for Labels</p>
              <div className="flex gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="include-label-mailer"
                    checked={includeLabelMailer === "yes"}
                    onChange={() => {
                      setIncludeLabelMailer("yes");
                      setDownloadOptions((prev) => ({ ...prev, labelMailer: true }));
                    }}
                  />
                  Yes
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="include-label-mailer"
                    checked={includeLabelMailer === "no"}
                    onChange={() => {
                      setIncludeLabelMailer("no");
                      setDownloadOptions((prev) => ({ ...prev, labelMailer: false }));
                    }}
                  />
                  No
                </label>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-slate-800">
                Select report outputs you want to download
              </p>
              <div className="space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={downloadOptions.exportExcel}
                    disabled={!canExportExcel}
                    onChange={(event) =>
                      setDownloadOptions((prev) => ({ ...prev, exportExcel: event.target.checked }))
                    }
                  />
                  A simple Excel export of the data
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={downloadOptions.exportCsv}
                    disabled={!canExportCsv}
                    onChange={(event) =>
                      setDownloadOptions((prev) => ({ ...prev, exportCsv: event.target.checked }))
                    }
                  />
                  A simple CSV export of the data
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={downloadOptions.activitiesPdf}
                    disabled={includeActivitiesReport !== "yes"}
                    onChange={(event) =>
                      setDownloadOptions((prev) => ({ ...prev, activitiesPdf: event.target.checked }))
                    }
                  />
                  Activities Report (PDF)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={downloadOptions.letterMailer}
                    disabled={includeLetterMailer !== "yes"}
                    onChange={(event) =>
                      setDownloadOptions((prev) => ({ ...prev, letterMailer: event.target.checked }))
                    }
                  />
                  Letter Mailer
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={downloadOptions.labelMailer}
                    disabled={includeLabelMailer !== "yes"}
                    onChange={(event) =>
                      setDownloadOptions((prev) => ({ ...prev, labelMailer: event.target.checked }))
                    }
                  />
                  Label Mailer
                </label>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setStep("activities")}>
              Back to Step 3
            </Button>
            <Button type="button" onClick={() => void prepareSelectedDownloads()} disabled={loadingBuild}>
              {loadingBuild ? "Preparing..." : "Prepare Selected Downloads"}
            </Button>
          </div>

          {loadingBuild ? (
            <div className="rounded-md border border-slate-200 p-4 text-center">
              <p className="text-lg font-semibold text-slate-900">Please wait as your report is being built</p>
              <div className="mt-2 flex items-center justify-center gap-1 text-2xl text-brand-600">
                <span className="animate-bounce">.</span>
                <span className="animate-bounce [animation-delay:120ms]">.</span>
                <span className="animate-bounce [animation-delay:240ms]">.</span>
              </div>
            </div>
          ) : null}

          {preparedDownloads.length > 0 ? (
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Your download files are ready</p>
              <div className="flex flex-wrap gap-2">
                {preparedDownloads.map((item) => (
                  <Button key={item.key} type="button" onClick={() => downloadPreparedFile(item)}>
                    Download {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
