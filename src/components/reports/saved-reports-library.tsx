"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { type ReportType } from "@/lib/reports/config";

type SavedReport = {
  id: string;
  name: string;
  reportType: ReportType;
  createdBy: string;
  updatedAt: string;
};

const REPORT_TYPE_OPTIONS: Array<{ label: string; value: ReportType }> = [
  { label: "Contacts", value: "contacts" },
  { label: "Transactions", value: "transactions" },
  { label: "Campaigns", value: "campaigns" },
  { label: "Donors", value: "donors" },
  { label: "Projects", value: "projects" },
  { label: "Memberships", value: "memberships" }
];

export function SavedReportsLibrary() {
  const [filterType, setFilterType] = useState<ReportType | "">("");
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSavedReports(nextType = filterType) {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (nextType) params.set("reportType", nextType);
    const response = await fetch(`/api/reports/saved?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load saved reports.");
      setLoading(false);
      return;
    }
    setReports((payload?.reports ?? []) as SavedReport[]);
    setLoading(false);
  }

  useEffect(() => {
    void loadSavedReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          Saved Reports are named report definitions. Generated files for the last 30 days are listed under Report
          History.
        </p>
        <Link href="/staff/reports/create">
          <Button type="button">Create New Report</Button>
        </Link>
      </div>

      <section className="rounded-md border border-slate-200 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Report Type</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={filterType}
              onChange={(event) => setFilterType(event.target.value as ReportType | "")}
            >
              <option value="">All Report Types</option>
              {REPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={() => void loadSavedReports()}>
              {loading ? "Filtering..." : "Apply Filter"}
            </Button>
          </div>
        </div>
      </section>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-slate-200 p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Report Name</th>
                <th className="py-2">Report Type</th>
                <th className="py-2">Created By</th>
                <th className="py-2">Last Modified</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link
                      href={`/staff/reports/create?savedReportId=${report.id}`}
                      className="text-brand-700 underline"
                    >
                      {report.name}
                    </Link>
                  </td>
                  <td className="py-2 capitalize">{report.reportType}</td>
                  <td className="py-2">{report.createdBy}</td>
                  <td className="py-2">{formatDate(report.updatedAt)}</td>
                </tr>
              ))}
              {reports.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={4}>
                    No saved report definitions found for the selected filter.
                    <span className="ml-1">
                      Looking for generated outputs? Visit{" "}
                      <Link href="/staff/reports/history" className="text-brand-700 underline">
                        Report History
                      </Link>
                      .
                    </span>
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
