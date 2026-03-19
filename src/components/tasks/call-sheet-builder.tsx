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
      const normalizedPriority = task.priority.trim().toLowerCase();
      const priorityLabel = normalizedPriority
        ? normalizedPriority.charAt(0).toUpperCase() + normalizedPriority.slice(1)
        : "Medium";
      const priorityWithMarker = normalizedPriority === "high" ? `${priorityLabel}!` : priorityLabel;
      return `
        <section class="call-item">
          <p class="index">#${index + 1}</p>
          <p class="headline"><strong>Person to call - Phone Number:</strong> ${escapeHtml(task.contactName)} - ${escapeHtml(task.contactPhone)}</p>
          <p><strong>Priority:</strong> ${escapeHtml(priorityWithMarker)}</p>
          <p><strong>Task Title:</strong> ${escapeHtml(task.title)}</p>
          <p><strong>Task Description:</strong> ${escapeHtml(task.description || "-")}</p>
          <p class="meta"><strong>Created By:</strong> ${escapeHtml(task.createdBy)} &nbsp; • &nbsp; <strong>Created At:</strong> ${escapeHtml(
            formatDateTime(task.createdAt) || "-"
          )}</p>
          <div class="write-line"></div>
          <div class="write-line"></div>
        </section>
        <hr class="item-divider" />
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
      .call-item { margin: 0 0 6px 0; font-size: 13px; }
      .call-item p { margin: 0 0 6px 0; color: #0f172a; }
      .call-item .headline { font-weight: 700; }
      .call-item .meta { color: #334155; font-size: 12px; }
      .call-item .index { font-size: 12px; color: #64748b; margin-bottom: 8px; }
      .write-line {
        margin: 10px 0;
        border-bottom: 1px solid #94a3b8;
        height: 20px;
      }
      .item-divider {
        border: 0;
        border-top: 2px solid #0f172a;
        margin: 10px 0 16px 0;
      }
      @media print { body { margin: 0.1in; } }
    </style>
  </head>
  <body>
    <h1>Call Sheet</h1>
    <p>Generated ${escapeHtml(generatedAt)}</p>
    ${
      rows ||
      '<section class="call-item"><p><strong>No call tasks available.</strong></p><div class="write-line"></div><div class="write-line"></div></section>'
    }
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
