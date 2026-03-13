"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type ReportField = {
  field_key: string;
  label: string;
  is_exportable: boolean;
};

type ReportDomain =
  | "contacts"
  | "donations"
  | "memberships"
  | "notes"
  | "tasks"
  | "communications";

export function ReportBuilderForm() {
  const [domain, setDomain] = useState<ReportDomain>("contacts");
  const [fields, setFields] = useState<ReportField[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [savedReports, setSavedReports] = useState<
    { id: string; name: string; description: string | null }[]
  >([]);
  const [reportName, setReportName] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadFieldsAndSaved() {
      setError(null);
      const [fieldsResponse, savedResponse] = await Promise.all([
        fetch(`/api/reports/fields?domain=${domain}`),
        fetch(`/api/reports/saved?domain=${domain}`)
      ]);

      if (!fieldsResponse.ok) {
        setError("Unable to load report fields.");
        return;
      }
      const fieldsPayload = await fieldsResponse.json();
      setFields(fieldsPayload.fields);
      setSelected(
        fieldsPayload.fields.slice(0, 5).map((field: ReportField) => field.field_key)
      );

      if (savedResponse.ok) {
        const savedPayload = await savedResponse.json();
        setSavedReports(savedPayload.reports ?? []);
      }
    }

    loadFieldsAndSaved();
  }, [domain]);

  const headerOrder = useMemo(() => Object.keys(rows[0] ?? {}), [rows]);

  async function runReport() {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/reports/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain, selectedFieldKeys: selected })
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.message ?? "Report failed.");
      setLoading(false);
      return;
    }
    setRows(payload.rows);
    setLoading(false);
  }

  async function exportReport(format: "csv" | "excel") {
    const response = await fetch("/api/reports/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ domain, selectedFieldKeys: selected, format })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.message ?? "Unable to export.");
      return;
    }

    const blob = await response.blob();
    const fileUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = fileUrl;
    a.download = `report.${format === "csv" ? "csv" : "xlsx"}`;
    a.click();
    URL.revokeObjectURL(fileUrl);
  }

  async function saveReport() {
    if (!reportName || selected.length === 0) return;
    const response = await fetch("/api/reports/saved", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: reportName,
        domain,
        selectedFieldKeys: selected
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.message ?? "Unable to save report.");
      return;
    }

    const savedResponse = await fetch(`/api/reports/saved?domain=${domain}`);
    if (savedResponse.ok) {
      const savedPayload = await savedResponse.json();
      setSavedReports(savedPayload.reports ?? []);
    }
    setReportName("");
  }

  async function runSaved(reportId: string) {
    const response = await fetch(`/api/reports/saved/${reportId}/run`, {
      method: "POST"
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.message ?? "Unable to run saved report.");
      return;
    }
    setRows(payload.rows ?? []);
  }

  function toggleField(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Domain</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={domain}
            onChange={(event) => setDomain(event.target.value as ReportDomain)}
          >
            <option value="contacts">Contacts</option>
            <option value="donations">Donations</option>
            <option value="memberships">Memberships</option>
            <option value="notes">Notes</option>
            <option value="tasks">Tasks</option>
            <option value="communications">Communications</option>
          </select>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 p-4">
        <p className="mb-2 text-sm font-medium text-slate-900">Selectable fields</p>
        <div className="grid gap-2 md:grid-cols-3">
          {fields.map((field) => (
            <label className="flex items-center gap-2 text-sm" key={field.field_key}>
              <input
                checked={selected.includes(field.field_key)}
                onChange={() => toggleField(field.field_key)}
                type="checkbox"
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={runReport} type="button" disabled={loading || selected.length === 0}>
          {loading ? "Running..." : "Run Report"}
        </Button>
        <input
          className="min-w-56 rounded-md border border-slate-300 px-3 py-2 text-sm"
          placeholder="Saved report name"
          value={reportName}
          onChange={(event) => setReportName(event.target.value)}
        />
        <Button variant="secondary" onClick={saveReport} type="button">
          Save Report
        </Button>
        <Button
          variant="secondary"
          onClick={() => exportReport("csv")}
          type="button"
          disabled={selected.length === 0}
        >
          Export CSV
        </Button>
        <Button
          variant="secondary"
          onClick={() => exportReport("excel")}
          type="button"
          disabled={selected.length === 0}
        >
          Export Excel
        </Button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {savedReports.length > 0 ? (
        <div className="rounded-md border border-slate-200 p-4">
          <p className="mb-2 text-sm font-medium text-slate-900">Saved Reports</p>
          <div className="flex flex-wrap gap-2">
            {savedReports.map((report) => (
              <Button
                key={report.id}
                variant="ghost"
                type="button"
                onClick={() => runSaved(report.id)}
              >
                {report.name}
              </Button>
            ))}
          </div>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-md border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                {headerOrder.map((header) => (
                  <th className="px-3 py-2" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr className="border-b border-slate-100" key={idx}>
                  {headerOrder.map((header) => (
                    <td className="px-3 py-2" key={header}>
                      {String(row[header] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
