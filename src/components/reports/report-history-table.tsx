"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

type ReportHistoryRow = {
  id: string;
  reportMode: "constituent" | "transaction" | "project";
  reportName: string;
  filterCriteria: string;
  outputType: string;
  builtBy: string;
  generatedAt: string;
  downloadHref: string;
};

const REPORT_MODE_OPTIONS = [
  { value: "", label: "All Report Modes" },
  { value: "constituent", label: "Constituent Report" },
  { value: "transaction", label: "Transaction Report" },
  { value: "project", label: "Project Report" }
] as const;

const OUTPUT_TYPE_OPTIONS = [
  { value: "", label: "All Output Types" },
  { value: "csv", label: "CSV" },
  { value: "excel", label: "XLS" },
  { value: "pdf", label: "PDF" }
] as const;

export function ReportHistoryTable() {
  const [reportMode, setReportMode] = useState<string>("");
  const [outputType, setOutputType] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [rows, setRows] = useState<ReportHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory(nextMode = reportMode, nextOutputType = outputType) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (nextMode) params.set("reportMode", nextMode);
      if (nextOutputType) params.set("outputType", nextOutputType);
      const response = await fetch(`/api/reports/history?${params.toString()}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to load report history.");
      }
      setRows(Array.isArray(payload?.rows) ? (payload.rows as ReportHistoryRow[]) : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load report history.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.reportName,
        row.filterCriteria,
        row.outputType,
        row.builtBy,
        row.reportMode
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, searchText]);

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Report Mode</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={reportMode}
              onChange={(event) => setReportMode(event.target.value)}
            >
              {REPORT_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Output Type</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={outputType}
              onChange={(event) => setOutputType(event.target.value)}
            >
              {OUTPUT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Search</label>
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Filter by name, filter criteria, user..."
            />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" variant="secondary" onClick={() => void loadHistory()}>
              {loading ? "Filtering..." : "Apply Filters"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setReportMode("");
                setOutputType("");
                setSearchText("");
                void loadHistory("", "");
              }}
            >
              Clear
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Showing report artifacts generated in the last 30 days.</p>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-slate-200 p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Report Name</th>
                <th className="py-2">Filter Criteria + Type</th>
                <th className="py-2">Built By</th>
                <th className="py-2">Generated On</th>
                <th className="py-2">Download</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className="py-2">
                    <div className="font-medium text-slate-900">{row.reportName}</div>
                    <div className="text-xs capitalize text-slate-500">{row.reportMode} report</div>
                  </td>
                  <td className="py-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {row.outputType}
                    </div>
                    <div className="mt-1 text-sm text-slate-700">{row.filterCriteria}</div>
                  </td>
                  <td className="py-2 text-slate-700">{row.builtBy}</td>
                  <td className="py-2 text-slate-700">{formatDateTime(row.generatedAt)}</td>
                  <td className="py-2">
                    <a
                      href={row.downloadHref}
                      className="inline-flex rounded-md bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={5}>
                    No report history rows match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
