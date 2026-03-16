"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";

type ImportCenterLandingProps = {
  initialTemplates: Array<Record<string, unknown>>;
  initialJobs: Array<Record<string, unknown>>;
  schemaWarning?: string | null;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function formatDate(value: unknown) {
  const text = toText(value);
  if (!text) return "-";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleString();
}

export function ImportCenterLanding({
  initialTemplates,
  initialJobs,
  schemaWarning
}: ImportCenterLandingProps) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [jobs] = useState(initialJobs);
  const [busyTemplateId, setBusyTemplateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refreshTemplates() {
    const response = await fetch("/api/import-center/templates?importType=contacts");
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to reload templates.");
    }
    setTemplates((payload?.templates ?? []) as Array<Record<string, unknown>>);
  }

  async function editTemplateName(templateId: string, currentName: string) {
    const nextName = window.prompt("Template name", currentName);
    if (!nextName || nextName.trim() === currentName.trim()) return;
    setBusyTemplateId(templateId);
    setError(null);
    try {
      const response = await fetch(`/api/import-center/templates/${templateId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nextName.trim() })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to rename template.");
      await refreshTemplates();
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "Unable to rename template.");
    } finally {
      setBusyTemplateId(null);
    }
  }

  async function cloneTemplate(templateId: string) {
    setBusyTemplateId(templateId);
    setError(null);
    try {
      const response = await fetch(`/api/import-center/templates/${templateId}/clone`, {
        method: "POST"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to clone template.");
      await refreshTemplates();
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "Unable to clone template.");
    } finally {
      setBusyTemplateId(null);
    }
  }

  async function toggleTemplateActive(templateId: string, nextActive: boolean) {
    setBusyTemplateId(templateId);
    setError(null);
    try {
      const response = await fetch(`/api/import-center/templates/${templateId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isActive: nextActive })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to update template status.");
      await refreshTemplates();
    } catch (templateError) {
      setError(
        templateError instanceof Error ? templateError.message : "Unable to update template status."
      );
    } finally {
      setBusyTemplateId(null);
    }
  }

  async function deleteTemplate(templateId: string) {
    const confirmed = window.confirm("Delete this template?");
    if (!confirmed) return;
    setBusyTemplateId(templateId);
    setError(null);
    try {
      const response = await fetch(`/api/import-center/templates/${templateId}`, {
        method: "DELETE"
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to delete template.");
      await refreshTemplates();
    } catch (templateError) {
      setError(templateError instanceof Error ? templateError.message : "Unable to delete template.");
    } finally {
      setBusyTemplateId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Import Center"
          subtitle="Reusable manual import framework for CSV/Excel data when direct APIs are unavailable."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/staff/import-center/contacts"
            className="rounded-lg border border-brand-200 bg-brand-50 p-4 transition hover:bg-brand-100"
          >
            <p className="text-sm font-semibold text-brand-800">Create Contact Import</p>
            <p className="mt-1 text-xs text-brand-700">
              Launch the 5-step contacts import workflow with templates, tags, and duplicate checks.
            </p>
          </Link>
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-600">
            Future import types placeholder: Financial, Activities, Notes, Tags, and other modules
            will plug into this same engine.
          </div>
        </div>
      </Card>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {schemaWarning ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {schemaWarning}
        </p>
      ) : null}

      <Card>
        <CardHeader title="Import History" subtitle="Recent Import Center jobs and outcomes." />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2">Import Type</th>
                <th className="py-2">File Name</th>
                <th className="py-2">Status</th>
                <th className="py-2">Rows</th>
                <th className="py-2">Success</th>
                <th className="py-2">Failed</th>
                <th className="py-2">Skipped</th>
                <th className="py-2">New Tags</th>
                <th className="py-2">Started</th>
                <th className="py-2">Completed</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={toText(job.id)} className="border-b border-slate-100">
                  <td className="py-2">{toText(job.import_type) || "-"}</td>
                  <td className="py-2">{toText(job.file_name) || "-"}</td>
                  <td className="py-2">{toText(job.status) || "-"}</td>
                  <td className="py-2">{toText(job.total_rows) || "0"}</td>
                  <td className="py-2">{toText(job.successful_rows) || "0"}</td>
                  <td className="py-2">{toText(job.failed_rows) || "0"}</td>
                  <td className="py-2">{toText(job.skipped_rows) || "0"}</td>
                  <td className="py-2">{toText(job.new_tags_created) || "0"}</td>
                  <td className="py-2">{formatDate(job.started_at)}</td>
                  <td className="py-2">{formatDate(job.completed_at)}</td>
                </tr>
              ))}
              {jobs.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={10}>
                    No import jobs have been run yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Import Templates"
          subtitle="Manage reusable mapping templates for Contacts Import."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2">Name</th>
                <th className="py-2">Type</th>
                <th className="py-2">Status</th>
                <th className="py-2">Created</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => {
                const templateId = toText(template.id);
                const active = Boolean(template.is_active);
                return (
                  <tr key={templateId} className="border-b border-slate-100">
                    <td className="py-2">{toText(template.name) || "-"}</td>
                    <td className="py-2">{toText(template.import_type) || "-"}</td>
                    <td className="py-2">{active ? "Active" : "Inactive"}</td>
                    <td className="py-2">{formatDate(template.created_at)}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyTemplateId === templateId}
                          onClick={() => editTemplateName(templateId, toText(template.name))}
                        >
                          Edit Name
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyTemplateId === templateId}
                          onClick={() => cloneTemplate(templateId)}
                        >
                          Clone
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyTemplateId === templateId}
                          onClick={() => toggleTemplateActive(templateId, !active)}
                        >
                          {active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busyTemplateId === templateId}
                          onClick={() => deleteTemplate(templateId)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {templates.length === 0 ? (
                <tr>
                  <td className="py-3 text-slate-500" colSpan={5}>
                    No templates created yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
