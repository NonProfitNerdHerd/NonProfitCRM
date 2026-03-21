"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type JobRow = Record<string, unknown>;
type FailedRow = Record<string, unknown>;

type DashboardProps = {
  initialJobs: JobRow[];
  initialTotal: number;
  initialLimit: number;
  initialOffset: number;
};

type FiltersState = {
  status: string;
  importType: string;
  fromDate: string;
  toDate: string;
  submittedBy: string;
  fileSearch: string;
};

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700",
  processing: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  completed_with_errors: "bg-amber-100 text-amber-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-200 text-slate-700",
  stalled: "bg-orange-100 text-orange-700"
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function formatDate(value: unknown) {
  const text = toText(value);
  if (!text) return "-";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
}

function prettyStatus(value: unknown) {
  const text = toText(value);
  if (!text) return "-";
  return text.replaceAll("_", " ");
}

function ProgressCell({ job }: { job: JobRow }) {
  const percent = Math.max(0, Math.min(100, toNumber(job.progress_percent, 0)));
  const processed = toNumber(job.processed_rows, 0);
  const total = toNumber(job.total_rows, 0);
  return (
    <div className="min-w-[190px] space-y-1">
      <div className="h-2 w-full rounded bg-slate-200">
        <div className="h-2 rounded bg-brand-600" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-slate-600">
        {percent}% ({processed}/{total})
      </p>
    </div>
  );
}

export function ImportJobsDashboard({
  initialJobs,
  initialTotal,
  initialLimit,
  initialOffset
}: DashboardProps) {
  const [filters, setFilters] = useState<FiltersState>({
    status: "",
    importType: "",
    fromDate: "",
    toDate: "",
    submittedBy: "",
    fileSearch: ""
  });
  const [jobs, setJobs] = useState<JobRow[]>(initialJobs);
  const [total, setTotal] = useState(initialTotal);
  const [limit, setLimit] = useState(initialLimit);
  const [offset, setOffset] = useState(initialOffset);
  const [selectedJobId, setSelectedJobId] = useState<string>(toText(initialJobs[0]?.id));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<JobRow | null>(null);
  const [failedRows, setFailedRows] = useState<FailedRow[]>([]);
  const [failedRowsTotal, setFailedRowsTotal] = useState(0);
  const [failedRowsOffset, setFailedRowsOffset] = useState(0);
  const [failedRowsLimit] = useState(25);
  const [failedRowsSearch, setFailedRowsSearch] = useState("");
  const [failedRowsOnly, setFailedRowsOnly] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(total / Math.max(1, limit))), [limit, total]);
  const currentPage = useMemo(() => Math.floor(offset / Math.max(1, limit)) + 1, [limit, offset]);

  async function loadJobs(nextOffset = offset, nextLimit = limit, signal?: AbortSignal) {
    const params = new URLSearchParams();
    params.set("offset", String(nextOffset));
    params.set("limit", String(nextLimit));
    if (filters.status) params.set("status", filters.status);
    if (filters.importType) params.set("importType", filters.importType);
    if (filters.fromDate) params.set("fromDate", filters.fromDate);
    if (filters.toDate) params.set("toDate", filters.toDate);
    if (filters.submittedBy) params.set("submittedBy", filters.submittedBy);
    if (filters.fileSearch) params.set("fileSearch", filters.fileSearch);

    const response = await fetch(`/api/import-center/jobs?${params.toString()}`, { signal });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to load import jobs.");
    }
    const nextJobs = (payload?.jobs ?? []) as JobRow[];
    setJobs(nextJobs);
    setTotal(toNumber(payload?.total, nextJobs.length));
    setLimit(toNumber(payload?.limit, nextLimit));
    setOffset(toNumber(payload?.offset, nextOffset));
    if (nextJobs.length > 0 && !nextJobs.some((job) => toText(job.id) === selectedJobId)) {
      setSelectedJobId(toText(nextJobs[0].id));
    }
  }

  async function loadDetail(jobId: string, nextFailedOffset = failedRowsOffset) {
    if (!jobId) return;
    const params = new URLSearchParams();
    params.set("failedOffset", String(nextFailedOffset));
    params.set("failedLimit", String(failedRowsLimit));
    if (failedRowsSearch) params.set("failedSearch", failedRowsSearch);
    const response = await fetch(`/api/import-center/jobs/${encodeURIComponent(jobId)}?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to load job detail.");
    }
    setDetail((payload?.job ?? null) as JobRow | null);
    setFailedRows((payload?.failedRows?.rows ?? []) as FailedRow[]);
    setFailedRowsTotal(toNumber(payload?.failedRows?.total, 0));
    setFailedRowsOffset(toNumber(payload?.failedRows?.offset, 0));
  }

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      await loadJobs(offset, limit);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh jobs.");
    } finally {
      setLoading(false);
    }
  }

  async function stopJob(jobId: string) {
    const confirmed = window.confirm("Stop this import job? Partial progress will be preserved.");
    if (!confirmed) return;
    setBusyAction(`stop:${jobId}`);
    setError(null);
    try {
      const response = await fetch(`/api/import-center/jobs/${encodeURIComponent(jobId)}/stop`, {
        method: "POST"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to stop job.");
      await refreshAll();
      await loadDetail(jobId, failedRowsOffset);
    } catch (stopError) {
      setError(stopError instanceof Error ? stopError.message : "Unable to stop job.");
    } finally {
      setBusyAction(null);
    }
  }

  async function retryFailedRows(jobId: string) {
    setBusyAction(`retry:${jobId}`);
    setError(null);
    try {
      const response = await fetch(`/api/import-center/jobs/${encodeURIComponent(jobId)}/retry-failed`, {
        method: "POST"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to retry failed rows.");
      await refreshAll();
      const nextJobId = toText(payload?.jobId);
      if (nextJobId) {
        setSelectedJobId(nextJobId);
        setFailedRowsOffset(0);
        await loadDetail(nextJobId, 0);
      }
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Unable to retry failed rows.");
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    if (!selectedJobId) {
      setDetail(null);
      setFailedRows([]);
      return;
    }
    loadDetail(selectedJobId, failedRowsOffset).catch((detailError) => {
      setError(detailError instanceof Error ? detailError.message : "Unable to load selected job.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJobId, failedRowsOffset, failedRowsLimit, failedRowsSearch]);

  useEffect(() => {
    const controller = new AbortController();
    const interval = window.setInterval(() => {
      loadJobs(offset, limit, controller.signal).catch(() => null);
      if (selectedJobId) {
        loadDetail(selectedJobId, failedRowsOffset).catch(() => null);
      }
    }, 8000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, limit, selectedJobId, failedRowsOffset, failedRowsSearch, filters]);

  const selectedStatus = toText(detail?.status);
  const stopAllowed = selectedStatus === "queued" || selectedStatus === "processing";
  const retryAllowed =
    (selectedStatus === "failed" ||
      selectedStatus === "completed_with_errors" ||
      selectedStatus === "stalled" ||
      selectedStatus === "cancelled") &&
    toNumber(detail?.failed_rows, 0) > 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Import Jobs"
          subtitle="Persistent monitoring, control, and reporting for async Import Center jobs."
        />
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={filters.status}
            onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="">All statuses</option>
            <option value="queued">queued</option>
            <option value="processing">processing</option>
            <option value="completed">completed</option>
            <option value="completed_with_errors">completed_with_errors</option>
            <option value="failed">failed</option>
            <option value="cancelled">cancelled/stopped</option>
            <option value="stalled">stalled</option>
          </select>
          <select
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
            value={filters.importType}
            onChange={(event) => setFilters((current) => ({ ...current, importType: event.target.value }))}
          >
            <option value="">All import types</option>
            <option value="contacts">contacts</option>
            <option value="transactions">transactions</option>
          </select>
          <Input
            placeholder="File name search"
            value={filters.fileSearch}
            onChange={(event) => setFilters((current) => ({ ...current, fileSearch: event.target.value }))}
          />
          <Input
            type="date"
            value={filters.fromDate}
            onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
          />
          <Input
            type="date"
            value={filters.toDate}
            onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
          />
          <Input
            placeholder="Submitted by (user ID)"
            value={filters.submittedBy}
            onChange={(event) => setFilters((current) => ({ ...current, submittedBy: event.target.value }))}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => {
              setOffset(0);
              refreshAll();
            }}
            disabled={loading}
          >
            {loading ? "Applying..." : "Apply Filters"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFilters({
                status: "",
                importType: "",
                fromDate: "",
                toDate: "",
                submittedBy: "",
                fileSearch: ""
              });
              setOffset(0);
            }}
          >
            Clear Filters
          </Button>
          <Button type="button" variant="secondary" onClick={() => refreshAll()} disabled={loading}>
            Refresh
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      </Card>

      <Card>
        <CardHeader title="Job Queue and History" subtitle="Click any job row to view full details." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1400px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2">Job ID</th>
                <th className="py-2">Import Type</th>
                <th className="py-2">Source File</th>
                <th className="py-2">Submitted By</th>
                <th className="py-2">Created</th>
                <th className="py-2">Started</th>
                <th className="py-2">Completed</th>
                <th className="py-2">Status</th>
                <th className="py-2">Progress</th>
                <th className="py-2">Rows</th>
                <th className="py-2">Last Activity</th>
                <th className="py-2">Last Error</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const id = toText(job.id);
                const status = toText(job.status);
                return (
                  <tr
                    key={id}
                    className={`cursor-pointer border-b border-slate-100 ${
                      selectedJobId === id ? "bg-brand-50" : "hover:bg-slate-50"
                    }`}
                    onClick={() => {
                      setSelectedJobId(id);
                      setFailedRowsOffset(0);
                    }}
                  >
                    <td className="py-2 font-mono text-xs text-slate-700">{id || "-"}</td>
                    <td className="py-2">{toText(job.import_type) || "-"}</td>
                    <td className="py-2">{toText(job.file_name) || "-"}</td>
                    <td className="py-2">{toText(job.submitted_by_name) || "-"}</td>
                    <td className="py-2">{formatDate(job.created_at)}</td>
                    <td className="py-2">{formatDate(job.processing_started_at || job.started_at)}</td>
                    <td className="py-2">{formatDate(job.completed_at)}</td>
                    <td className="py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          STATUS_BADGE[status] ?? "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {prettyStatus(status)}
                      </span>
                    </td>
                    <td className="py-2">
                      <ProgressCell job={job} />
                    </td>
                    <td className="py-2 text-xs text-slate-700">
                      total {toNumber(job.total_rows, 0)} | processed {toNumber(job.processed_rows, 0)} | ok{" "}
                      {toNumber(job.successful_rows, 0)} | failed {toNumber(job.failed_rows, 0)}
                    </td>
                    <td className="py-2">{formatDate(job.last_activity_at)}</td>
                    <td className="max-w-[260px] py-2 text-xs text-red-700">
                      {toText(job.last_error_message) || "-"}
                    </td>
                  </tr>
                );
              })}
              {jobs.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={12}>
                    No import jobs found for the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-slate-600">
            Page {currentPage} of {pageCount} ({total} total jobs)
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={offset <= 0}
              onClick={() => {
                const nextOffset = Math.max(0, offset - limit);
                setOffset(nextOffset);
                loadJobs(nextOffset, limit).catch(() => null);
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={offset + limit >= total}
              onClick={() => {
                const nextOffset = offset + limit;
                setOffset(nextOffset);
                loadJobs(nextOffset, limit).catch(() => null);
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Job Detail" subtitle="Operational detail, error rows, logs, and corrective actions." />
        {!detail ? (
          <p className="text-sm text-slate-600">Select a job to inspect full details.</p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Job ID:</span> <span className="font-mono">{toText(detail.id)}</span>
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Import Type:</span> {toText(detail.import_type) || "-"}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">File Name:</span> {toText(detail.file_name) || "-"}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Submitted By:</span> {toText(detail.submitted_by_name) || "-"}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Submitted:</span> {formatDate(detail.created_at)}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Started:</span>{" "}
                {formatDate(detail.processing_started_at || detail.started_at)}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Completed:</span> {formatDate(detail.completed_at)}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Last Activity:</span> {formatDate(detail.last_activity_at)}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Manual Stop Requested:</span>{" "}
                {Boolean(detail.stop_requested) ? "Yes" : "No"}
              </p>
              <p className="text-sm">
                <span className="font-semibold text-slate-900">Last Checkpoint:</span>{" "}
                {toNumber(detail.last_processed_row, toNumber(detail.processed_rows, 0))}
              </p>
              <p className="text-sm xl:col-span-2">
                <span className="font-semibold text-slate-900">Error Summary:</span>{" "}
                <span className="text-red-700">{toText(detail.last_error_message) || "-"}</span>
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="danger"
                disabled={!stopAllowed || busyAction !== null}
                onClick={() => stopJob(toText(detail.id))}
              >
                Stop Job
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!retryAllowed || busyAction !== null}
                onClick={() => retryFailedRows(toText(detail.id))}
              >
                Retry Failed Rows
              </Button>
              <a
                className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
                href={`/api/import-center/jobs/${encodeURIComponent(toText(detail.id))}/errors`}
              >
                Download Failure Report
              </a>
              <a
                className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
                href={`/api/import-center/jobs/${encodeURIComponent(toText(detail.id))}/corrected-template`}
              >
                Download Corrected Template
              </a>
              <a
                className="inline-flex items-center rounded-md bg-slate-100 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-200"
                href={`/api/import-center/jobs/${encodeURIComponent(toText(detail.id))}/report`}
              >
                Download Job Summary
              </a>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">Processor Log Snippet</p>
              <div className="max-h-48 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                <pre className="whitespace-pre-wrap">{toText(detail.processor_log) || "No processor log available."}</pre>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={failedRowsOnly}
                    onChange={(event) => setFailedRowsOnly(event.target.checked)}
                  />
                  View only failed rows
                </label>
                <Input
                  className="max-w-sm"
                  placeholder="Filter failed rows by error message"
                  value={failedRowsSearch}
                  onChange={(event) => {
                    setFailedRowsOffset(0);
                    setFailedRowsSearch(event.target.value);
                  }}
                />
              </div>
              {failedRowsOnly ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200">
                        <th className="py-2">Row #</th>
                        <th className="py-2">Error</th>
                        <th className="py-2">Raw Row</th>
                      </tr>
                    </thead>
                    <tbody>
                      {failedRows.map((row) => (
                        <tr key={`${toText(row.id)}:${toText(row.row_index)}`} className="border-b border-slate-100">
                          <td className="py-2">{toText(row.row_index) || "-"}</td>
                          <td className="max-w-[320px] py-2 text-xs text-red-700">{toText(row.error_message) || "-"}</td>
                          <td className="py-2 text-xs text-slate-700">
                            <pre className="max-h-28 overflow-auto whitespace-pre-wrap">
                              {JSON.stringify(row.raw_row ?? {}, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      ))}
                      {failedRows.length === 0 ? (
                        <tr>
                          <td className="py-3 text-slate-500" colSpan={3}>
                            No failed rows for this job.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-600">
                  Row-level detail storage currently tracks failed rows only. Turn this filter on to inspect failures.
                </p>
              )}
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-600">{failedRowsTotal} failed rows</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={failedRowsOffset <= 0}
                    onClick={() => setFailedRowsOffset(Math.max(0, failedRowsOffset - failedRowsLimit))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={failedRowsOffset + failedRowsLimit >= failedRowsTotal}
                    onClick={() => setFailedRowsOffset(failedRowsOffset + failedRowsLimit)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
