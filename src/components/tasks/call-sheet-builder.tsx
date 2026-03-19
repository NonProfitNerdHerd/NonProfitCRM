"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/utils";

type CallSheetTask = {
  id: string;
  title: string;
  description: string;
  priority: string;
  createdAt: string | null;
  createdBy: string;
  contactName: string;
  contactPhone: string;
};

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildCallSheetHtml(tasks: CallSheetTask[]) {
  const generatedAt = formatDateTime(new Date());
  const rows = tasks
    .map((task, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(task.contactName)}</td>
          <td>${escapeHtml(task.contactPhone)}</td>
          <td><strong>${escapeHtml(task.title)}</strong><br/>${escapeHtml(task.description || "-")}</td>
          <td>${escapeHtml(task.priority)}</td>
          <td>${escapeHtml(task.createdBy)}</td>
          <td>${escapeHtml(formatDateTime(task.createdAt) || "-")}</td>
          <td></td>
        </tr>
      `;
    })
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Call Sheet</title>
    <style>
      @page { size: landscape; margin: 0.35in; }
      body { font-family: Arial, sans-serif; margin: 0.2in; color: #0f172a; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 0 0 14px; color: #475569; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
      th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; text-align: left; }
      th { background: #f1f5f9; }
      th:nth-child(1), td:nth-child(1) { width: 4%; }
      th:nth-child(2), td:nth-child(2) { width: 12%; }
      th:nth-child(3), td:nth-child(3) { width: 11%; }
      th:nth-child(4), td:nth-child(4) { width: 16%; }
      th:nth-child(5), td:nth-child(5) { width: 8%; }
      th:nth-child(6), td:nth-child(6) { width: 10%; }
      th:nth-child(7), td:nth-child(7) { width: 14%; }
      th:nth-child(8), td:nth-child(8) { width: 25%; }
      @media print { body { margin: 0.1in; } }
    </style>
  </head>
  <body>
    <h1>Call Sheet</h1>
    <p>Generated ${escapeHtml(generatedAt)}</p>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Contact Name</th>
          <th>Phone Number</th>
          <th>Task / Note Details</th>
          <th>Priority</th>
          <th>Created By</th>
          <th>Created At</th>
          <th>Additional Notes</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="8">No call tasks available.</td></tr>'}
      </tbody>
    </table>
  </body>
</html>`;
}

export function CallSheetBuilder() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<CallSheetTask[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [response] = await Promise.all([
          fetch("/api/tasks/call-sheet"),
          new Promise((resolve) => setTimeout(resolve, 900))
        ]);
        const payload = (await response.json().catch(() => null)) as
          | { tasks?: CallSheetTask[]; message?: string }
          | null;
        if (!response.ok) {
          throw new Error(payload?.message ?? "Unable to build call sheet.");
        }
        if (!cancelled) {
          setTasks(payload?.tasks ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to build call sheet.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const callSheetHtml = useMemo(() => buildCallSheetHtml(tasks), [tasks]);

  function downloadAndPrint() {
    const blob = new Blob([callSheetHtml], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `call-sheet-${stamp}.html`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(callSheetHtml);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 300);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[52vh] flex-col items-center justify-center gap-5 text-center">
        <p className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
          Your call sheet is being built
        </p>
        <div className="inline-flex items-center gap-2" aria-label="Building call sheet">
          <span className="h-3 w-3 animate-bounce rounded-full bg-brand-600 [animation-delay:0ms]" />
          <span className="h-3 w-3 animate-bounce rounded-full bg-brand-600 [animation-delay:150ms]" />
          <span className="h-3 w-3 animate-bounce rounded-full bg-brand-600 [animation-delay:300ms]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[52vh] flex-col items-center justify-center gap-4 text-center">
      <p className="text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
        Your call sheet is ready
      </p>
      <p className="text-sm text-slate-600">
        Call sheet ready with {tasks.length} call task{tasks.length === 1 ? "" : "s"}.
      </p>
      <Button type="button" onClick={downloadAndPrint}>
        Download your call sheet and print
      </Button>
    </div>
  );
}
