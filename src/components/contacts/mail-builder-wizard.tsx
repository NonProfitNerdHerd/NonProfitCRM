"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";

type MailStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;
type ContactSegment = "donors" | "donor_organizations" | "all";
type ActivityType = "all" | "transactions";
type PaperSize = "letter" | "legal" | "tabloid" | "a4" | "a5";
type MailerType = "label" | "envelope";

type AveryLabelProduct = {
  key: string;
  label: string;
  columns: number;
  rows: number;
  labelWidthIn: number;
  labelHeightIn: number;
  topMarginIn: number;
  leftMarginIn: number;
  horizontalGapIn: number;
  verticalGapIn: number;
  pageWidthIn: number;
  pageHeightIn: number;
};

type EnvelopeSizeOption = {
  key: string;
  label: string;
  widthIn: number;
  heightIn: number;
};

type MailTemplate = {
  id: string;
  name: string;
  paper_size: PaperSize;
  template_body: string;
  is_active: boolean;
  margin_top_in: number;
  margin_left_in: number;
  margin_right_in: number;
  margin_bottom_in: number;
  include_mailer: boolean;
  mailer_type: MailerType | null;
  mailer_size_key: string | null;
  label_margin_top_in: number;
  label_margin_left_in: number;
  label_margin_right_in: number;
  label_margin_bottom_in: number;
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

const AVERY_LABEL_PRODUCTS: AveryLabelProduct[] = [
  {
    key: "avery_5160",
    label: "Avery 5160 / 8160 (30 per sheet, 1\" x 2.625\")",
    columns: 3,
    rows: 10,
    labelWidthIn: 2.625,
    labelHeightIn: 1,
    topMarginIn: 0.5,
    leftMarginIn: 0.1875,
    horizontalGapIn: 0.125,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "avery_5161",
    label: "Avery 5161 / 8161 (20 per sheet, 1\" x 4\")",
    columns: 2,
    rows: 10,
    labelWidthIn: 4,
    labelHeightIn: 1,
    topMarginIn: 0.5,
    leftMarginIn: 0.15625,
    horizontalGapIn: 0.1875,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "avery_5162",
    label: "Avery 5162 / 8162 (14 per sheet, 1.333\" x 4\")",
    columns: 2,
    rows: 7,
    labelWidthIn: 4,
    labelHeightIn: 1.333,
    topMarginIn: 0.833,
    leftMarginIn: 0.15625,
    horizontalGapIn: 0.1875,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "avery_5163",
    label: "Avery 5163 / 8163 (10 per sheet, 2\" x 4\")",
    columns: 2,
    rows: 5,
    labelWidthIn: 4,
    labelHeightIn: 2,
    topMarginIn: 0.5,
    leftMarginIn: 0.15625,
    horizontalGapIn: 0.1875,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "avery_5164",
    label: "Avery 5164 / 8164 (6 per sheet, 3.333\" x 4\")",
    columns: 2,
    rows: 3,
    labelWidthIn: 4,
    labelHeightIn: 3.333,
    topMarginIn: 0.5,
    leftMarginIn: 0.15625,
    horizontalGapIn: 0.1875,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  }
];

const ENVELOPE_SIZE_OPTIONS: EnvelopeSizeOption[] = [
  { key: "envelope_10", label: "#10 Envelope (9.5 x 4.125)", widthIn: 9.5, heightIn: 4.125 },
  { key: "envelope_dl", label: "DL Envelope (8.66 x 4.33)", widthIn: 8.66, heightIn: 4.33 },
  { key: "envelope_c5", label: "C5 Envelope (9.0 x 6.4)", widthIn: 9, heightIn: 6.4 }
];

function toCsvCell(value: unknown) {
  const cell = String(value ?? "");
  if (cell.includes(",") || cell.includes('"') || cell.includes("\n")) {
    return `"${cell.replaceAll('"', '""')}"`;
  }
  return cell;
}

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

  const mergedLines = templateBody.split("\n").flatMap((originalLine) => {
    const hasToken = /\{\{\s*[a-z0-9_]+\s*\}\}/i.test(originalLine);
    const mergedLine = originalLine
      .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, token: string) => {
        return valueMap[normalizeLower(token)] ?? "";
      })
      .replace(/\s+,/g, ",")
      .replace(/,\s*,+/g, ",")
      .replace(/\s{2,}/g, " ")
      .replace(/,\s*$/g, "")
      .trimEnd();

    if (hasToken && mergedLine.trim() === "") return [];
    return [mergedLine];
  });
  return mergedLines.join("\n");
}

function getEnvelopeSizeOption(mailerSizeKey: string | null | undefined) {
  if (!mailerSizeKey) return null;
  return ENVELOPE_SIZE_OPTIONS.find((option) => option.key === mailerSizeKey) ?? null;
}

function getAveryLabelProduct(mailerSizeKey: string | null | undefined) {
  if (!mailerSizeKey) return null;
  return AVERY_LABEL_PRODUCTS.find((option) => option.key === mailerSizeKey) ?? null;
}

function paperSizeToFormat(paperSize: PaperSize): string | number[] {
  if (paperSize === "a4") return "a4";
  if (paperSize === "a5") return "a5";
  if (paperSize === "legal") return "legal";
  if (paperSize === "tabloid") return [11 * 72, 17 * 72];
  return "letter";
}

const STEP_TITLES: Array<{ key: MailStep; label: string }> = [
  { key: 1, label: "Step 1 - Select Donors, Donor Organizations, or All Contacts" },
  { key: 2, label: "Step 2 - Activity Filter (Transactions + Date Range)" },
  { key: 3, label: "Step 3 - Further Filter by Campaign" },
  { key: 4, label: "Step 4 - Select / Build Template + Margins" },
  { key: 5, label: "Step 5 - Labels / Envelopes" },
  { key: 6, label: "Step 6 - Print Preview" },
  { key: 7, label: "Step 7 - Export PDFs" }
];

export function MailBuilderWizard() {
  const [step, setStep] = useState<MailStep>(1);
  const [loading, setLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [segment, setSegment] = useState<ContactSegment>("donors");
  const [activityType, setActivityType] = useState<ActivityType>("all");
  const [transactionsFrom, setTransactionsFrom] = useState("");
  const [transactionsTo, setTransactionsTo] = useState("");
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [campaignOptions, setCampaignOptions] = useState<Array<{ id: string; name: string; status: string }>>(
    []
  );

  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateForm, setTemplateForm] = useState({
    name: "",
    paperSize: "letter" as PaperSize,
    templateBody: defaultTemplateBody(),
    isActive: true,
    marginTopIn: "0.5",
    marginLeftIn: "0.5",
    marginRightIn: "0.5",
    marginBottomIn: "0.5",
    includeMailer: false,
    mailerType: "label" as MailerType,
    mailerSizeKey: "avery_5160",
    labelMarginTopIn: "0",
    labelMarginLeftIn: "0",
    labelMarginRightIn: "0",
    labelMarginBottomIn: "0"
  });

  const [recipients, setRecipients] = useState<MailRecipient[]>([]);
  const [step2Recipients, setStep2Recipients] = useState<MailRecipient[]>([]);
  const [step3Recipients, setStep3Recipients] = useState<MailRecipient[]>([]);
  const [step2Loading, setStep2Loading] = useState(false);
  const [step3Loading, setStep3Loading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    void Promise.all([loadTemplates(), loadCampaignOptions()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mergedPreviewText = useMemo(() => {
    if (toText(templateForm.templateBody) === "" || recipients.length === 0) return "";
    const currentRecipient = recipients[Math.min(previewIndex, Math.max(0, recipients.length - 1))];
    return applyTemplate(templateForm.templateBody, currentRecipient);
  }, [templateForm.templateBody, recipients, previewIndex]);

  const previewMarginsPx = useMemo(() => {
    const top = Math.max(0, Number(templateForm.marginTopIn || 0)) * 96;
    const left = Math.max(0, Number(templateForm.marginLeftIn || 0)) * 96;
    const right = Math.max(0, Number(templateForm.marginRightIn || 0)) * 96;
    const bottom = Math.max(0, Number(templateForm.marginBottomIn || 0)) * 96;
    return { top, left, right, bottom };
  }, [
    templateForm.marginTopIn,
    templateForm.marginLeftIn,
    templateForm.marginRightIn,
    templateForm.marginBottomIn
  ]);

  const availableMailerSizes = useMemo(
    () =>
      templateForm.mailerType === "label"
        ? AVERY_LABEL_PRODUCTS.map((option) => ({ key: option.key, label: option.label }))
        : ENVELOPE_SIZE_OPTIONS.map((option) => ({ key: option.key, label: option.label })),
    [templateForm.mailerType]
  );

  useEffect(() => {
    if (step !== 2) return;
    void loadStep2Results();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, segment, activityType, transactionsFrom, transactionsTo]);

  useEffect(() => {
    if (step !== 3) return;
    void loadStep3Results();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, segment, activityType, transactionsFrom, transactionsTo, selectedCampaignId]);

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
        isActive: first.is_active,
        marginTopIn: String(first.margin_top_in ?? 0.5),
        marginLeftIn: String(first.margin_left_in ?? 0.5),
        marginRightIn: String(first.margin_right_in ?? 0.5),
        marginBottomIn: String(first.margin_bottom_in ?? 0.5),
        includeMailer: Boolean(first.include_mailer),
        mailerType: (first.mailer_type ?? "label") as MailerType,
        mailerSizeKey: first.mailer_size_key ?? "avery_5160",
        labelMarginTopIn: String(first.label_margin_top_in ?? 0),
        labelMarginLeftIn: String(first.label_margin_left_in ?? 0),
        labelMarginRightIn: String(first.label_margin_right_in ?? 0),
        labelMarginBottomIn: String(first.label_margin_bottom_in ?? 0)
      });
    }
  }

  async function loadCampaignOptions() {
    const response = await fetch("/api/mail-builder/campaigns");
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to load campaign options.");
      return;
    }
    const campaigns = (payload?.campaigns ?? []) as Array<{ id: string; name: string; status: string }>;
    setCampaignOptions(campaigns);
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
          isActive: templateForm.isActive,
          marginTopIn: Number(templateForm.marginTopIn || 0.5),
          marginLeftIn: Number(templateForm.marginLeftIn || 0.5),
          marginRightIn: Number(templateForm.marginRightIn || 0.5),
          marginBottomIn: Number(templateForm.marginBottomIn || 0.5),
          includeMailer: templateForm.includeMailer,
          mailerType: templateForm.mailerType,
          mailerSizeKey: templateForm.includeMailer ? templateForm.mailerSizeKey : null,
          labelMarginTopIn: Number(templateForm.labelMarginTopIn || 0),
          labelMarginLeftIn: Number(templateForm.labelMarginLeftIn || 0),
          labelMarginRightIn: Number(templateForm.labelMarginRightIn || 0),
          labelMarginBottomIn: Number(templateForm.labelMarginBottomIn || 0)
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
      isActive: true,
      marginTopIn: "0.5",
      marginLeftIn: "0.5",
      marginRightIn: "0.5",
      marginBottomIn: "0.5",
      includeMailer: false,
      mailerType: "label",
      mailerSizeKey: "avery_5160",
      labelMarginTopIn: "0",
      labelMarginLeftIn: "0",
      labelMarginRightIn: "0",
      labelMarginBottomIn: "0"
    });
    setMessage("Template deleted.");
    await loadTemplates();
  }

  async function fetchRecipients(campaignId: string | null) {
    const response = await fetch("/api/mail-builder/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        segment,
        activityType,
        transactionsFrom: transactionsFrom || null,
        transactionsTo: transactionsTo || null,
        campaignId
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to build recipient list.");
    }
    return {
      recipients: (payload?.recipients ?? []) as MailRecipient[],
      totalCount: Number(payload?.totalCount ?? 0)
    };
  }

  async function loadStep2Results() {
    setStep2Loading(true);
    clearMessages();
    try {
      const result = await fetchRecipients(null);
      setStep2Recipients(result.recipients);
      setMessage(`Step 2 results loaded: ${result.totalCount} contacts.`);
    } catch (resultError) {
      setError(resultError instanceof Error ? resultError.message : "Unable to load Step 2 results.");
      setStep2Recipients([]);
    } finally {
      setStep2Loading(false);
    }
  }

  async function loadStep3Results() {
    setStep3Loading(true);
    clearMessages();
    try {
      const result = await fetchRecipients(selectedCampaignId || null);
      setStep3Recipients(result.recipients);
      setMessage(`Step 3 results loaded: ${result.totalCount} contacts.`);
    } catch (resultError) {
      setError(resultError instanceof Error ? resultError.message : "Unable to load Step 3 results.");
      setStep3Recipients([]);
    } finally {
      setStep3Loading(false);
    }
  }

  async function generatePreview() {
    setLoading(true);
    clearMessages();
    try {
      const result = await fetchRecipients(selectedCampaignId || null);
      setRecipients(result.recipients);
      setPreviewIndex(0);
      setMessage(`Loaded ${result.totalCount} recipients for this mailing.`);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Unable to generate preview.");
    } finally {
      setLoading(false);
    }
  }

  function exportStep2Csv() {
    if (step2Recipients.length === 0) {
      setError("No Step 2 rows to export.");
      return;
    }
    const headers = [
      "Name",
      "Entity Type",
      "Tracking Status",
      "Email",
      "Phone",
      "Address 1",
      "Address 2",
      "City",
      "State",
      "Postal Code",
      "Transaction Count",
      "Transaction Total",
      "Last Transaction Date"
    ];
    const rows = step2Recipients.map((row) => [
      row.name,
      row.entityType,
      row.trackingStatus,
      row.email,
      row.phone,
      row.addressLine1,
      row.addressLine2,
      row.city,
      row.state,
      row.postalCode,
      row.transactionCount,
      row.transactionTotal,
      formatDateIso(row.lastTransactionDate)
    ]);
    const csv = [headers.map((item) => toCsvCell(item)).join(","), ...rows.map((row) => row.map((item) => toCsvCell(item)).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fileDate = new Date().toISOString().slice(0, 10);
    link.href = href;
    link.download = `mail-builder-step-2-${fileDate}.csv`;
    link.click();
    URL.revokeObjectURL(href);
  }

  function goToNextStep() {
    if (step === 5 && recipients.length === 0) {
      void generatePreview();
    }
    setStep((prev) => Math.min(7, prev + 1) as MailStep);
  }

  function goToPreviousStep() {
    setStep((prev) => Math.max(1, prev - 1) as MailStep);
  }

  async function exportLettersPdf() {
    if (toText(templateForm.templateBody) === "" || recipients.length === 0) {
      setError("Generate preview recipients and add template body before downloading letters.");
      return;
    }
    setExporting(true);
    clearMessages();
    try {
      const { jsPDF } = await import("jspdf");
      const marginTopPt = Math.max(0, Number(templateForm.marginTopIn || 0.5)) * 72;
      const marginLeftPt = Math.max(0, Number(templateForm.marginLeftIn || 0.5)) * 72;
      const marginRightPt = Math.max(0, Number(templateForm.marginRightIn || 0.5)) * 72;
      const marginBottomPt = Math.max(0, Number(templateForm.marginBottomIn || 0.5)) * 72;
      const lettersDoc = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: paperSizeToFormat(templateForm.paperSize)
      });
      recipients.forEach((recipient, index) => {
        if (index > 0) lettersDoc.addPage();
        const textBlock = applyTemplate(templateForm.templateBody, recipient);
        const pageWidth = lettersDoc.internal.pageSize.getWidth();
        const pageHeight = lettersDoc.internal.pageSize.getHeight();
        const fontSize = 11;
        lettersDoc.setFont("times", "normal");
        lettersDoc.setFontSize(fontSize);
        const wrapped = lettersDoc.splitTextToSize(
          textBlock,
          Math.max(120, pageWidth - marginLeftPt - marginRightPt)
        );
        let y = marginTopPt + fontSize;
        const lineHeight = fontSize * 1.35;
        for (const line of wrapped) {
          if (y > pageHeight - marginBottomPt) {
            lettersDoc.addPage();
            y = marginTopPt + fontSize;
          }
          lettersDoc.text(line, marginLeftPt, y);
          y += lineHeight;
        }
      });
      const fileDate = new Date().toISOString().slice(0, 10);
      lettersDoc.save(`mail-builder-letters-${fileDate}.pdf`);
      setMessage("Letter PDF downloaded.");
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to download letter PDF.");
    } finally {
      setExporting(false);
    }
  }

  async function exportMailerPdf() {
    if (!templateForm.includeMailer) {
      setError("Enable labels/envelopes first.");
      return;
    }
    if (recipients.length === 0) {
      setError("Generate preview recipients before downloading labels/envelopes.");
      return;
    }
    setExporting(true);
    clearMessages();
    try {
      const { jsPDF } = await import("jspdf");
      const fileDate = new Date().toISOString().slice(0, 10);

      if (templateForm.mailerType === "label") {
        const product = getAveryLabelProduct(templateForm.mailerSizeKey);
        if (!product) {
          setError("Select an Avery product.");
          setExporting(false);
          return;
        }
        const labelMarginTopPt = Math.max(0, Number(templateForm.labelMarginTopIn || 0)) * 72;
        const labelMarginLeftPt = Math.max(0, Number(templateForm.labelMarginLeftIn || 0)) * 72;
        const labelMarginRightPt = Math.max(0, Number(templateForm.labelMarginRightIn || 0)) * 72;
        const labelMarginBottomPt = Math.max(0, Number(templateForm.labelMarginBottomIn || 0)) * 72;

        const doc = new jsPDF({
          orientation: "portrait",
          unit: "pt",
          format: [product.pageWidthIn * 72, product.pageHeightIn * 72]
        });

        const labelsPerSheet = product.columns * product.rows;
        const labelWidthPt = product.labelWidthIn * 72;
        const labelHeightPt = product.labelHeightIn * 72;
        const pageMarginTopPt = product.topMarginIn * 72;
        const pageMarginLeftPt = product.leftMarginIn * 72;
        const hGapPt = product.horizontalGapIn * 72;
        const vGapPt = product.verticalGapIn * 72;
        const fontSize = 10;

        recipients.forEach((recipient, index) => {
          if (index > 0 && index % labelsPerSheet === 0) doc.addPage();
          const indexOnSheet = index % labelsPerSheet;
          const row = Math.floor(indexOnSheet / product.columns);
          const col = indexOnSheet % product.columns;
          const labelX = pageMarginLeftPt + col * (labelWidthPt + hGapPt);
          const labelY = pageMarginTopPt + row * (labelHeightPt + vGapPt);
          const contentX = labelX + labelMarginLeftPt;
          const contentYStart = labelY + labelMarginTopPt + fontSize;
          const contentWidth = Math.max(40, labelWidthPt - labelMarginLeftPt - labelMarginRightPt);
          const contentBottom = labelY + labelHeightPt - labelMarginBottomPt;

          const blockText = [
            recipient.name,
            recipient.addressLine1,
            recipient.addressLine2,
            [recipient.city, recipient.state, recipient.postalCode].filter(Boolean).join(", ")
          ]
            .filter((line) => toText(line))
            .join("\n");

          doc.setFont("helvetica", "normal");
          doc.setFontSize(fontSize);
          const wrapped = doc.splitTextToSize(blockText, contentWidth);
          let y = contentYStart;
          const lineHeight = fontSize * 1.25;
          for (const line of wrapped) {
            if (y > contentBottom) break;
            doc.text(line, contentX, y);
            y += lineHeight;
          }
        });

        doc.save(`mail-builder-labels-${fileDate}.pdf`);
        setMessage("Labels PDF downloaded.");
        setExporting(false);
        return;
      }

      const envelope = getEnvelopeSizeOption(templateForm.mailerSizeKey);
      if (!envelope) {
        setError("Select an envelope size.");
        setExporting(false);
        return;
      }
      const widthPt = envelope.widthIn * 72;
      const heightPt = envelope.heightIn * 72;
      const envelopeDoc = new jsPDF({
        orientation: widthPt >= heightPt ? "landscape" : "portrait",
        unit: "pt",
        format: [widthPt, heightPt]
      });
      recipients.forEach((recipient, index) => {
        if (index > 0) envelopeDoc.addPage();
        const lines = [
          recipient.name,
          recipient.addressLine1,
          recipient.addressLine2,
          [recipient.city, recipient.state, recipient.postalCode].filter(Boolean).join(", ")
        ].filter((line) => toText(line));
        const pageWidth = envelopeDoc.internal.pageSize.getWidth();
        const pageHeight = envelopeDoc.internal.pageSize.getHeight();
        const fontSize = 13;
        const lineHeight = fontSize * 1.3;
        const blockHeight = lines.length * lineHeight;
        const startY = Math.max(26, (pageHeight - blockHeight) / 2);
        envelopeDoc.setFont("helvetica", "normal");
        envelopeDoc.setFontSize(fontSize);
        lines.forEach((line, lineIndex) => {
          envelopeDoc.text(line, pageWidth / 2, startY + lineIndex * lineHeight, { align: "center" });
        });
      });
      envelopeDoc.save(`mail-builder-envelopes-${fileDate}.pdf`);
      setMessage("Envelopes PDF downloaded.");
    } catch (exportError) {
      setError(
        exportError instanceof Error ? exportError.message : "Unable to download labels/envelopes PDF."
      );
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
                <input type="radio" checked={segment === "donors"} onChange={() => setSegment("donors")} />
                Donors
              </label>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input
                  type="radio"
                  checked={segment === "donor_organizations"}
                  onChange={() => setSegment("donor_organizations")}
                />
                Donor Organizations
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
            <div className="grid gap-3 md:grid-cols-2">
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
              ) : null}
            </div>

            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Step 2 Result List ({step2Recipients.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" onClick={() => void loadStep2Results()} disabled={step2Loading}>
                    {step2Loading ? "Refreshing..." : "Refresh Results"}
                  </Button>
                  <Button type="button" variant="secondary" onClick={exportStep2Csv} disabled={step2Recipients.length === 0}>
                    Export CSV
                  </Button>
                </div>
              </div>
              {step2Recipients.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Email</th>
                        <th className="py-2 pr-3">Phone</th>
                        <th className="py-2 pr-3">Location</th>
                        <th className="py-2 pr-3">Transactions</th>
                        <th className="py-2 pr-3">Total</th>
                        <th className="py-2 pr-3">Last Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {step2Recipients.map((row) => (
                        <tr key={row.contactId} className="border-b border-slate-100">
                          <td className="py-2 pr-3">{row.name}</td>
                          <td className="py-2 pr-3">{row.entityType}</td>
                          <td className="py-2 pr-3">{row.email || "-"}</td>
                          <td className="py-2 pr-3">{row.phone || "-"}</td>
                          <td className="py-2 pr-3">
                            {[row.city, row.state, row.postalCode].filter(Boolean).join(", ") || "-"}
                          </td>
                          <td className="py-2 pr-3">{row.transactionCount}</td>
                          <td className="py-2 pr-3">{formatCurrency(row.transactionTotal || 0)}</td>
                          <td className="py-2 pr-3">{formatDateIso(row.lastTransactionDate) || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No results loaded yet. Click <strong>Refresh Results</strong> to load everyone filtered by Steps 1-2.
                </p>
              )}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">Further filter by campaign</p>
            <div className="max-w-lg">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Campaign filter (optional)
              </label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={selectedCampaignId}
                onChange={(event) => setSelectedCampaignId(event.target.value)}
              >
                <option value="">No campaign filter</option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  Step 3 Result List ({step3Recipients.length})
                </p>
                <Button type="button" variant="secondary" onClick={() => void loadStep3Results()} disabled={step3Loading}>
                  {step3Loading ? "Refreshing..." : "Refresh Results"}
                </Button>
              </div>
              {step3Recipients.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-600">
                        <th className="py-2 pr-3">Name</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Email</th>
                        <th className="py-2 pr-3">Phone</th>
                        <th className="py-2 pr-3">Location</th>
                        <th className="py-2 pr-3">Transactions</th>
                        <th className="py-2 pr-3">Total</th>
                        <th className="py-2 pr-3">Last Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {step3Recipients.map((row) => (
                        <tr key={row.contactId} className="border-b border-slate-100">
                          <td className="py-2 pr-3">{row.name}</td>
                          <td className="py-2 pr-3">{row.entityType}</td>
                          <td className="py-2 pr-3">{row.email || "-"}</td>
                          <td className="py-2 pr-3">{row.phone || "-"}</td>
                          <td className="py-2 pr-3">
                            {[row.city, row.state, row.postalCode].filter(Boolean).join(", ") || "-"}
                          </td>
                          <td className="py-2 pr-3">{row.transactionCount}</td>
                          <td className="py-2 pr-3">{formatCurrency(row.transactionTotal || 0)}</td>
                          <td className="py-2 pr-3">{formatDateIso(row.lastTransactionDate) || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No results loaded yet. Select a campaign and click <strong>Refresh Results</strong>.
                </p>
              )}
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
                      isActive: nextTemplate.is_active,
                      marginTopIn: String(nextTemplate.margin_top_in ?? 0.5),
                      marginLeftIn: String(nextTemplate.margin_left_in ?? 0.5),
                      marginRightIn: String(nextTemplate.margin_right_in ?? 0.5),
                      marginBottomIn: String(nextTemplate.margin_bottom_in ?? 0.5),
                      includeMailer: Boolean(nextTemplate.include_mailer),
                      mailerType: (nextTemplate.mailer_type ?? "label") as MailerType,
                      mailerSizeKey: nextTemplate.mailer_size_key ?? "avery_5160",
                      labelMarginTopIn: String(nextTemplate.label_margin_top_in ?? 0),
                      labelMarginLeftIn: String(nextTemplate.label_margin_left_in ?? 0),
                      labelMarginRightIn: String(nextTemplate.label_margin_right_in ?? 0),
                      labelMarginBottomIn: String(nextTemplate.label_margin_bottom_in ?? 0)
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
                  <option value="legal">Legal (8.5 x 14)</option>
                  <option value="tabloid">Tabloid (11 x 17)</option>
                  <option value="a4">A4</option>
                  <option value="a5">A5</option>
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
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Top Margin (in)</label>
                <Input
                  type="number"
                  min="0"
                  max="3"
                  step="0.05"
                  value={templateForm.marginTopIn}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({ ...prev, marginTopIn: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Left Margin (in)</label>
                <Input
                  type="number"
                  min="0"
                  max="3"
                  step="0.05"
                  value={templateForm.marginLeftIn}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({ ...prev, marginLeftIn: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Right Margin (in)</label>
                <Input
                  type="number"
                  min="0"
                  max="3"
                  step="0.05"
                  value={templateForm.marginRightIn}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({ ...prev, marginRightIn: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Bottom Margin (in)</label>
                <Input
                  type="number"
                  min="0"
                  max="3"
                  step="0.05"
                  value={templateForm.marginBottomIn}
                  onChange={(event) =>
                    setTemplateForm((prev) => ({ ...prev, marginBottomIn: event.target.value }))
                  }
                />
              </div>
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
                    isActive: true,
                    marginTopIn: "0.5",
                    marginLeftIn: "0.5",
                    marginRightIn: "0.5",
                    marginBottomIn: "0.5",
                    includeMailer: false,
                    mailerType: "label",
                    mailerSizeKey: "avery_5160",
                    labelMarginTopIn: "0",
                    labelMarginLeftIn: "0",
                    labelMarginRightIn: "0",
                    labelMarginBottomIn: "0"
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
            <p className="text-sm font-medium text-slate-700">
              Would you like to print labels or envelopes in addition to letters?
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input
                  type="radio"
                  checked={!templateForm.includeMailer}
                  onChange={() =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      includeMailer: false
                    }))
                  }
                />
                No (letters only)
              </label>
              <label className="flex items-center gap-2 rounded-md border border-slate-200 p-3 text-sm">
                <input
                  type="radio"
                  checked={templateForm.includeMailer}
                  onChange={() =>
                    setTemplateForm((prev) => ({
                      ...prev,
                      includeMailer: true
                    }))
                  }
                />
                Yes (letters + labels/envelopes)
              </label>
            </div>
            {templateForm.includeMailer ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">Type</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={templateForm.mailerType}
                      onChange={(event) =>
                        setTemplateForm((prev) => ({
                          ...prev,
                          mailerType: event.target.value as MailerType,
                          mailerSizeKey:
                            event.target.value === "label"
                              ? AVERY_LABEL_PRODUCTS[0]?.key ?? prev.mailerSizeKey
                              : ENVELOPE_SIZE_OPTIONS[0]?.key ?? prev.mailerSizeKey
                        }))
                      }
                    >
                      <option value="label">Labels</option>
                      <option value="envelope">Envelopes</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">
                      {templateForm.mailerType === "label" ? "Avery product" : "Envelope size"}
                    </label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={templateForm.mailerSizeKey}
                      onChange={(event) =>
                        setTemplateForm((prev) => ({ ...prev, mailerSizeKey: event.target.value }))
                      }
                    >
                      {availableMailerSizes.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {templateForm.mailerType === "label" ? (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-slate-700">Label Margins (inches, inside each label)</p>
                    <div className="grid gap-3 md:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Top</label>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={templateForm.labelMarginTopIn}
                          onChange={(event) =>
                            setTemplateForm((prev) => ({ ...prev, labelMarginTopIn: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Left</label>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={templateForm.labelMarginLeftIn}
                          onChange={(event) =>
                            setTemplateForm((prev) => ({ ...prev, labelMarginLeftIn: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Right</label>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={templateForm.labelMarginRightIn}
                          onChange={(event) =>
                            setTemplateForm((prev) => ({ ...prev, labelMarginRightIn: event.target.value }))
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Bottom</label>
                        <Input
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={templateForm.labelMarginBottomIn}
                          onChange={(event) =>
                            setTemplateForm((prev) => ({ ...prev, labelMarginBottomIn: event.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Labels/envelopes are disabled for this template. You can enable later and save it as a reusable standard.
              </p>
            )}
          </div>
        ) : null}

        {step === 6 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void generatePreview()} disabled={loading}>
                {loading ? "Building preview..." : "Refresh Preview"}
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
                <div className="rounded-md border border-slate-300 bg-white">
                  <div
                    style={{
                      paddingTop: `${previewMarginsPx.top}px`,
                      paddingLeft: `${previewMarginsPx.left}px`,
                      paddingRight: `${previewMarginsPx.right}px`,
                      paddingBottom: `${previewMarginsPx.bottom}px`
                    }}
                  >
                    <pre className="whitespace-pre-wrap font-serif text-sm leading-6 text-slate-800">
                      {mergedPreviewText}
                    </pre>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                No preview generated yet. Click <strong>Refresh Preview</strong>.
              </p>
            )}
          </div>
        ) : null}

        {step === 7 ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              Export letter PDF and, if enabled, a second PDF for labels/envelopes.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void exportLettersPdf()} disabled={exporting}>
                {exporting ? "Working..." : "Download Letter"}
              </Button>
              {templateForm.includeMailer ? (
                <Button type="button" variant="secondary" onClick={() => void exportMailerPdf()} disabled={exporting}>
                  {exporting
                    ? "Working..."
                    : templateForm.mailerType === "envelope"
                      ? "Download Envelopes"
                      : "Download Labels"}
                </Button>
              ) : null}
              <span className="text-xs text-slate-600">Recipient count: {recipients.length}</span>
            </div>
            {templateForm.includeMailer ? (
              <p className="text-xs text-slate-600">
                This export will generate 2 files: letters PDF +{" "}
                {templateForm.mailerType === "envelope" ? "envelopes" : "labels"} PDF.
              </p>
            ) : (
              <p className="text-xs text-slate-600">This export will generate 1 file: letters PDF.</p>
            )}
          </div>
        ) : null}
      </section>

      <div className="flex justify-between">
        <Button type="button" variant="secondary" onClick={goToPreviousStep} disabled={step === 1}>
          Previous Step
        </Button>
        <Button type="button" onClick={goToNextStep} disabled={step === 7}>
          Next Step
        </Button>
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </div>
  );
}
