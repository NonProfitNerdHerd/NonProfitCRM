"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

type MailStep = 1 | 2 | 3 | 4 | 5 | 6;
type ContactSegment = "persons" | "organizations" | "all";
type ActivityType = "all" | "transactions";
type PaperSize = "letter" | "a4" | "label_4x6";

type MailTemplate = {
  id: string;
  name: string;
  paper_size: PaperSize;
  template_body: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type MailRecipient = {
  contactId: string;
  name: string;
  firstName: string;
  lastName: string;
  organizationName: string;
  entityType: string;
  trackingStatus: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  transactionCount: number;
  transactionTotal: number;
  lastTransactionDate: string;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return toText(value).toLowerCase();
}

function formatDateIso(iso: string) {
  if (!iso) return "";
  const parsed = new Date(iso.includes("T") ? iso : `${iso}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString();
}

function defaultTemplateBody() {
  return [
    "{{today}}",
    "",
    "{{name}}",
    "{{address_line_1}}",
    "{{address_line_2}}",
    "{{city}}, {{state}} {{postal_code}}",
    "",
    "Dear {{name}},",
    "",
    "Thank you for your support of our mission.",
    "",
    "Sincerely,",
    "Your Organization"
  ].join("\n");
}

function applyTemplate(templateBody: string, recipient: MailRecipient) {
  const today = new Date().toLocaleDateString();
  const valueMap: Record<string, string> = {
    today,
    name: recipient.name,
    first_name: recipient.firstName,
    last_name: recipient.lastName,
    organization_name: recipient.organizationName,
    address_line_1: recipient.addressLine1,
    address_line_2: recipient.addressLine2,
    city: recipient.city,
    state: recipient.state,
    postal_code: recipient.postalCode,
    email: recipient.email,
    phone: recipient.phone,
    tracking_status: recipient.trackingStatus,
    entity_type: recipient.entityType,
    transaction_count: String(recipient.transactionCount),
    transaction_total: formatCurrency(recipient.transactionTotal || 0),
    last_transaction_date: formatDateIso(recipient.lastTransactionDate)
  };

  return templateBody.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, token: string) => {
    return valueMap[normalizeLower(token)] ?? "";
  });
}

const STEP_TITLES: Array<{ key: MailStep; label: string }> = [
  { key: 1, label: "Step 1 - Select Persons, Organizations, or All Contacts" },
  { key: 2, label: "Step 2 - Activity Filter (Transactions + Date Range)" },
  { key: 3, label: "Step 3 - Further Filter by Tag" },
  { key: 4, label: "Step 4 - Select / Build Template" },
  { key: 5, label: "Step 5 - Print Preview" },
  { key: 6, label: "Step 6 - Export PDF" }
];

export function MailBuilderWizard() {
  const [step, setStep] = useState<MailStep>(1);
  const [loading, setLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [segment, setSegment] = useState<ContactSegment>("all");
  const [activityType, setActivityType] = useState<ActivityType>("all");
  const [transactionsFrom, setTransactionsFrom] = useState("");
  const [transactionsTo, setTransactionsTo] = useState("");
  const [search, setSearch] = useState("");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [tagOptions, setTagOptions] = useState<Array<{ id: string; path: string }>>([]);

  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    paperSize: "letter" as PaperSize,
    templateBody: defaultTemplateBody(),
    isActive: true
  });

  const [recipients, setRecipients] = useState<MailRecipient[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    void Promise.all([loadTemplates(), loadTagOptions()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [templates, selectedTemplateId]
  );

  const mergedPreviewText = useMemo(() => {
    if (!selectedTemplate || recipients.length === 0) return "";
    const currentRecipient = recipients[Math.min(previewIndex, Math.max(0, recipients.length - 1))];
    return applyTemplate(selectedTemplate.template_body, currentRecipient);
  }, [selectedTemplate, recipients, previewIndex]);

  async function loadTemplates() {
    const response = await fetch("/api/mail-builder/templates");
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load mail templates.");
      return;
    }
    const nextTemplates = (payload?.templates ?? []) as MailTemplate[];
    setTemplates(nextTemplates);
    if (!selectedTemplateId && nextTemplates.length > 0) {
      const first = nextTemplates[0];
      setSelectedTemplateId(first.id);
      setTemplateForm({
        name: first.name,
        paperSize: first.paper_size,
        templateBody: first.template_body,
        isActive: first.is_active
      });
    }
  }

  async function loadTagOptions() {
    const response = await fetch("/api/admin/tags/search?activeOnly=true&limit=200");
    const payload = await response.json().catch(() => null);
    if (!response.ok) return;
    const tags = (payload?.tags ?? []) as Array<{ id: string; path: string }>;
    setTagOptions(tags);
  }

  function clearMessages() {
    setError(null);
    setMessage(null);
  }

  async function saveTemplate() {
    setSavingTemplate(true);
    clearMessages();
    try {
      const response = await fetch("/api/mail-builder/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selectedTemplateId || undefined,
          name: templateForm.name,
          paperSize: templateForm.paperSize,
          templateBody: templateForm.templateBody,
          isActive: templateForm.isActive
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to save template.");
      const template = payload?.template as MailTemplate;
      if (template?.id) setSelectedTemplateId(template.id);
      setMessage("Template saved.");
      await loadTemplates();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save template.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function deleteTemplate() {
    if (!selectedTemplateId) return;
    if (!window.confirm("Delete this template?")) return;
    clearMessages();
    const response = await fetch(`/api/mail-builder/templates/${encodeURIComponent(selectedTemplateId)}`, {
      method: "DELETE"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to delete template.");
      return;
    }
    setSelectedTemplateId("");
    setTemplateForm({
      name: "",
      paperSize: "letter",
      templateBody: defaultTemplateBody(),
      isActive: true
    });
    setMessage("Template deleted.");
    await loadTemplates();
  }

  async function generatePreview() {
    setLoading(true);
    clearMessages();
    try {
      const response = await fetch("/api/mail-builder/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          segment,
          activityType,
          transactionsFrom: transactionsFrom || null,
          transactionsTo: transactionsTo || null,
          tagId: selectedTagId || null,
          search: search || null
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to generate mail preview.");
      setRecipients((payload?.recipients ?? []) as MailRecipient[]);
      setPreviewIndex(0);
      setMessage(`Loaded ${Number(payload?.totalCount ?? 0)} recipients for this mailing.`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to generate preview.");
    } finally {
      setLoading(false);
    }
  }

  function goToNextStep() {
    if (step === 4 && recipients.length === 0) {
      void generatePreview();
    }
    setStep((prev) => Math.min(6, prev + 1) as MailStep);
  }

  function goToPreviousStep() {
    setStep((prev) => Math.max(1, prev - 1) as MailStep);
  }

  async function exportPdf() {
    if (!selectedTemplate || recipients.length === 0) {
      setError("Generate preview recipients and select a template before exporting PDF.");
      return;
    }
    setExporting(true);
    clearMessages();
    try {
      const { jsPDF } = await import("jspdf");
      const format: string | number[] =
        selectedTemplate.paper_size === "label_4x6"
          ? [4 * 72, 6 * 72]
          : selectedTemplate.paper_size === "a4"
            ? "a4"
            : "letter";
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format });
      recipients.forEach((recipient, index) => {
        if (index > 0) doc.addPage();
        const textBlock = applyTemplate(selectedTemplate.template_body, recipient);
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = selectedTemplate.paper_size === "label_4x6" ? 18 : 40;
        const fontSize = selectedTemplate.paper_size === "label_4x6" ? 10 : 11;
        doc.setFont("times", "normal");
        doc.setFontSize(fontSize);
        const wrapped = doc.splitTextToSize(textBlock, pageWidth - margin * 2);
        let y = margin + fontSize;
        const lineHeight = fontSize * 1.35;
        for (const line of wrapped) {
          if (y > pageHeight - margin) {
            doc.addPage();
            y = margin + fontSize;
          }
          doc.text(line, margin, y);
          y += lineHeight;
        }
      });
      const fileDate = new Date().toISOString().slice(0, 10);
      doc.save(`mail-builder-${fileDate}.pdf`);
      setMessage("PDF export generated.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export PDF.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-slate-200 p-4">
        <h3 className="text-base font-semibold text-slate-900">Mail Builder</h3>
        <p className="text-sm text-slate-600">
          Build recipient lists from contacts, apply filters, choose a template, preview, and export PDF.
        </p>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {STEP_TITLES.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setStep(entry.key)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                step === entry.key
                  ? "border-brand-200 bg-brand-100 text-brand-800"
                  : "border-slate-200 bg-slate-100 text-slate-700"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Select recipient segment</p>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input type="radio" checked={segment === "persons"} onChange={() => setSegment("persons")} />
                Persons
              </label>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input
                  type="radio"
                  checked={segment === "organizations"}
                  onChange={() => setSegment("organizations")}
                />
                Organizations
              </label>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input type="radio" checked={segment === "all"} onChange={() => setSegment("all")} />
                All Contacts
              </label>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">What type of activities are you looking for?</p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input type="radio" checked={activityType === "all"} onChange={() => setActivityType("all")} />
                No activity restriction (all contacts)
              </label>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input
                  type="radio"
                  checked={activityType === "transactions"}
                  onChange={() => setActivityType("transactions")}
                />
                Transactions
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {activityType === "transactions" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Transactions from
                    </label>
                    <Input
                      type="date"
                      value={transactionsFrom}
                      onChange={(event) => setTransactionsFrom(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      Transactions to
                    </label>
                    <Input
                      type="date"
                      value={transactionsTo}
                      onChange={(event) => setTransactionsTo(event.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="md:col-span-2" />
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Search contacts</label>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name, org, email, phone"
                />
              </div>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Further filter by tag</p>
            <div className="max-w-lg">
              <label className="mb-1 block text-xs font-medium text-slate-600">Tag filter (optional)</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={selectedTagId}
                onChange={(event) => setSelectedTagId(event.target.value)}
              >
                <option value="">No tag filter</option>
                {tagOptions.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.path}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Select a template and manage your letter/label templates
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Template</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={selectedTemplateId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    setSelectedTemplateId(nextId);
                    const nextTemplate = templates.find((template) => template.id === nextId);
                    if (!nextTemplate) return;
                    setTemplateForm({
                      name: nextTemplate.name,
                      paperSize: nextTemplate.paper_size,
                      templateBody: nextTemplate.template_body,
                      isActive: nextTemplate.is_active
                    });
                  }}
                >
                  <option value="">Create new template...</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Paper size</label>
                <select
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  value={templateForm.paperSize}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({ ...prev, paperSize: event.target.value as PaperSize }))
                  }
                >
                  <option value="letter">Letter (8.5 x 11)</option>
                  <option value="a4">A4</option>
                  <option value="label_4x6">Label (4 x 6)</option>
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Template name</label>
              <Input
                value={templateForm.name}
                onChange={(event) => setTemplateForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Example: Spring Donor Letter"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Template body</label>
              <textarea
                className="min-h-[220px] w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={templateForm.templateBody}
                onChange={(event) =>
                  setTemplateForm((prev) => ({ ...prev, templateBody: event.target.value }))
                }
              />
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Available placeholders: {"{{name}}"}, {"{{first_name}}"}, {"{{last_name}}"},{" "}
              {"{{organization_name}}"}, {"{{address_line_1}}"}, {"{{address_line_2}}"}, {"{{city}}"},{" "}
              {"{{state}}"}, {"{{postal_code}}"}, {"{{email}}"}, {"{{phone}}"}, {"{{transaction_count}}"},{" "}
              {"{{transaction_total}}"}, {"{{last_transaction_date}}"}, {"{{today}}"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void saveTemplate()} disabled={savingTemplate}>
                {savingTemplate ? "Saving..." : "Save Template"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setSelectedTemplateId("");
                  setTemplateForm({
                    name: "",
                    paperSize: "letter",
                    templateBody: defaultTemplateBody(),
                    isActive: true
                  });
                }}
              >
                New Template
              </Button>
              {selectedTemplateId ? (
                <Button type="button" variant="secondary" onClick={() => void deleteTemplate()}>
                  Delete Template
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void generatePreview()} disabled={loading}>
                {loading ? "Building preview..." : "Build Preview"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => window.print()}>
                Print Preview
              </Button>
              <span className="text-xs text-slate-600">Recipients: {recipients.length}</span>
            </div>
            {recipients.length > 0 ? (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setPreviewIndex((prev) => Math.max(0, prev - 1))}
                    disabled={previewIndex <= 0}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setPreviewIndex((prev) => Math.min(recipients.length - 1, prev + 1))}
                    disabled={previewIndex >= recipients.length - 1}
                  >
                    Next
                  </Button>
                  <span>
                    Previewing recipient {previewIndex + 1} of {recipients.length}
                  </span>
                </div>
                <div className="rounded-md border border-slate-300 bg-white p-6">
                  <pre className="whitespace-pre-wrap font-serif text-sm leading-6 text-slate-800">
                    {mergedPreviewText}
                  </pre>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                No preview generated yet. Click <strong>Build Preview</strong>.
              </p>
            )}
          </div>
        ) : null}

        {step === 6 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Export the active preview to a PDF file. Each recipient is rendered on its own page.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void exportPdf()} disabled={exporting}>
                {exporting ? "Exporting..." : "Export PDF"}
              </Button>
              <span className="text-xs text-slate-600">Recipient count: {recipients.length}</span>
            </div>
          </div>
        ) : null}
      </section>

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={goToPreviousStep} disabled={step === 1}>
          Previous Step
        </Button>
        <Button type="button" onClick={goToNextStep} disabled={step === 6}>
          Next Step
        </Button>
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
