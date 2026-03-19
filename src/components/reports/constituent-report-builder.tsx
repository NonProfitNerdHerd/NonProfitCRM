"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { jsPDF } from "jspdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ReportMode = "constituent" | "transaction" | "project";
type BuilderStep = "filters" | "fields" | "activities" | "mailer" | "letterSetup" | "labelSetup" | "generate";
type RowRecord = Record<string, unknown>;
type PaperSize = "letter" | "legal" | "tabloid" | "a4" | "a5";

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

type MailTemplate = {
  id: string;
  name: string;
  paper_size: PaperSize;
  template_body: string;
  margin_top_in: number;
  margin_left_in: number;
  margin_right_in: number;
  margin_bottom_in: number;
};

type LabelProduct = {
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

type DownloadJobKey = "excel" | "csv" | "activities" | "letter" | "labels";
type DownloadJob = {
  key: DownloadJobKey;
  label: string;
  fileName: string;
  status: "pending" | "building" | "ready" | "error";
  url: string | null;
  message?: string;
};

type TagSummaryRow = {
  tagId: string;
  tagName: string;
  tagPath: string;
  level: number;
};

type TagTreeNode = {
  tagId: string;
  tagName: string;
  tagPath: string;
  level: number;
  pathKey: string;
  children: TagTreeNode[];
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

const PAPER_SIZE_OPTIONS: Array<{ key: PaperSize; label: string }> = [
  { key: "letter", label: 'Letter (8.5" x 11")' },
  { key: "legal", label: 'Legal (8.5" x 14")' },
  { key: "tabloid", label: 'Tabloid (11" x 17")' },
  { key: "a4", label: "A4" },
  { key: "a5", label: "A5" }
];

const MAIL_LABEL_PRODUCTS: LabelProduct[] = [
  {
    key: "avery_5160",
    label: 'Avery 5160 / 8160 (30 per sheet, 1" x 2.625")',
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
    key: "avery_5260",
    label: 'Avery 5260 (30 per sheet, 1" x 2.625")',
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
    key: "avery_5960",
    label: 'Avery 5960 (30 per sheet, 1" x 2.625", clear labels)',
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
    label: 'Avery 5161 / 8161 (20 per sheet, 1" x 4")',
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
    label: 'Avery 5162 / 8162 (14 per sheet, 1.333" x 4")',
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
    label: 'Avery 5163 / 8163 (10 per sheet, 2" x 4")',
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
    label: 'Avery 5164 / 8164 (6 per sheet, 3.333" x 4")',
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
  },
  {
    key: "avery_8167",
    label: 'Avery 8167 (80 per sheet, 0.5" x 1.75", return address)',
    columns: 4,
    rows: 20,
    labelWidthIn: 1.75,
    labelHeightIn: 0.5,
    topMarginIn: 0.5,
    leftMarginIn: 0.25,
    horizontalGapIn: 0.125,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "avery_5167",
    label: 'Avery 5167 (80 per sheet, 0.5" x 1.75", return address)',
    columns: 4,
    rows: 20,
    labelWidthIn: 1.75,
    labelHeightIn: 0.5,
    topMarginIn: 0.5,
    leftMarginIn: 0.25,
    horizontalGapIn: 0.125,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "avery_5168",
    label: 'Avery 5168 (4 per sheet, 3.5" x 5")',
    columns: 2,
    rows: 2,
    labelWidthIn: 3.5,
    labelHeightIn: 5,
    topMarginIn: 0.5,
    leftMarginIn: 0,
    horizontalGapIn: 0,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "avery_5169",
    label: 'Avery 5169 (4 per sheet, 3.5" x 5")',
    columns: 2,
    rows: 2,
    labelWidthIn: 3.5,
    labelHeightIn: 5,
    topMarginIn: 0.5,
    leftMarginIn: 0,
    horizontalGapIn: 0,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "generic_30_up",
    label: 'Generic 30-up sheet (1" x 2.625")',
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
    key: "generic_21_up",
    label: 'Generic 21-up sheet (1.333" x 2.5")',
    columns: 3,
    rows: 7,
    labelWidthIn: 2.5,
    labelHeightIn: 1.333,
    topMarginIn: 0.5,
    leftMarginIn: 0.25,
    horizontalGapIn: 0.125,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "generic_24_up",
    label: 'Generic 24-up sheet (1" x 2", 4 x 6 layout)',
    columns: 4,
    rows: 6,
    labelWidthIn: 2,
    labelHeightIn: 1,
    topMarginIn: 0.5,
    leftMarginIn: 0.25,
    horizontalGapIn: 0.125,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "generic_10_up",
    label: 'Generic 10-up sheet (2" x 4")',
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
    key: "dymo_30252",
    label: 'Dymo 30252 compatible (1.125" x 3.5", 14-up)',
    columns: 2,
    rows: 7,
    labelWidthIn: 3.5,
    labelHeightIn: 1.125,
    topMarginIn: 0.5,
    leftMarginIn: 0.5,
    horizontalGapIn: 0.25,
    verticalGapIn: 0.125,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "shipping_2x4",
    label: 'Shipping labels 2" x 4" (6-up)',
    columns: 2,
    rows: 3,
    labelWidthIn: 4,
    labelHeightIn: 2,
    topMarginIn: 0.5,
    leftMarginIn: 0.25,
    horizontalGapIn: 0,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  },
  {
    key: "shipping_4x6",
    label: 'Shipping labels 4" x 6" (2-up)',
    columns: 1,
    rows: 2,
    labelWidthIn: 4,
    labelHeightIn: 6,
    topMarginIn: 0,
    leftMarginIn: 2.25,
    horizontalGapIn: 0,
    verticalGapIn: 0,
    pageWidthIn: 8.5,
    pageHeightIn: 11
  }
];

const defaultLetterEditorHtml = [
  "<p>{{today}}</p>",
  "<p>{{name}}</p>",
  "<p>{{address}}</p>",
  "<p>Dear {{name}},</p>",
  "<p>Thank you for your continued partnership and support.</p>",
  "<p>Sincerely,<br/>Your Organization</p>"
].join("");

const LETTER_TOKEN_REFERENCE = [
  { token: "{{today}}", fieldName: "Today", description: "Current date based on browser locale." },
  { token: "{{name}}", fieldName: "Constituent Name", description: "Contact or organization display name." },
  { token: "{{address}}", fieldName: "Full Address", description: "Address, city, state, and postal code combined." },
  { token: "{{email}}", fieldName: "Email", description: "Primary email for the constituent." },
  { token: "{{phone}}", fieldName: "Phone", description: "Primary phone number for the constituent." },
  { token: "{{city}}", fieldName: "City", description: "City value from constituent record." },
  { token: "{{state}}", fieldName: "State", description: "State value from constituent record." },
  { token: "{{zip}}", fieldName: "Postal Code", description: "Postal code value from constituent record." }
] as const;

const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
  { code: "DC", name: "District of Columbia" }
];

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function chunkArray<T>(items: T[], size: number) {
  if (size <= 0) return [items];
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function paperSizePoints(size: PaperSize): [number, number] {
  if (size === "legal") return [612, 1008];
  if (size === "tabloid") return [792, 1224];
  if (size === "a4") return [595.28, 841.89];
  if (size === "a5") return [419.53, 595.28];
  return [612, 792];
}

function templateBodyToHtml(templateBody: string) {
  const escaped = templateBody
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
  return escaped
    .split("\n")
    .map((line) => `<p>${line || "<br/>"}</p>`)
    .join("");
}

export function ConstituentReportBuilder() {
  const [reportMode, setReportMode] = useState<ReportMode>("constituent");
  const [step, setStep] = useState<BuilderStep>("filters");
  const [error, setError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingGeneration, setLoadingGeneration] = useState(false);
  const [reportRunLocked, setReportRunLocked] = useState(false);
  const [rows, setRows] = useState<RowRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [metadata, setMetadata] = useState<MetadataPayload | null>(null);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [canExportCsv, setCanExportCsv] = useState(true);
  const [canExportExcel, setCanExportExcel] = useState(true);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [tagSummaryRows, setTagSummaryRows] = useState<TagSummaryRow[]>([]);
  const [loadingTagSummary, setLoadingTagSummary] = useState(false);
  const [includeActivitiesReport, setIncludeActivitiesReport] = useState<"yes" | "no">("no");
  const [includeLetterMailer, setIncludeLetterMailer] = useState<"yes" | "no">("no");
  const [includeLabelMailer, setIncludeLabelMailer] = useState<"yes" | "no">("no");

  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [templatesLoaded, setTemplatesLoaded] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [letterPaperSize, setLetterPaperSize] = useState<PaperSize>("letter");
  const [letterMargins, setLetterMargins] = useState({
    top: 0.5,
    left: 0.5,
    right: 0.5,
    bottom: 0.5
  });
  const [letterEditorHtml, setLetterEditorHtml] = useState(defaultLetterEditorHtml);
  const [editorFontFamily, setEditorFontFamily] = useState("Arial");
  const editorRef = useRef<HTMLDivElement | null>(null);

  const [selectedLabelProductKey, setSelectedLabelProductKey] = useState("avery_5160");
  const [labelMargins, setLabelMargins] = useState({
    top: 0,
    left: 0,
    right: 0,
    bottom: 0
  });

  const [downloadJobs, setDownloadJobs] = useState<DownloadJob[]>([]);

  const [filters, setFilters] = useState({
    entityType: [] as string[],
    trackingStatus: [] as string[],
    city: "",
    state: "",
    taskStatus: [] as string[],
    membershipStatus: [] as string[]
  });

  const [filterSectionsOpen, setFilterSectionsOpen] = useState({
    city: false,
    state: false,
    entityType: false,
    trackingStatus: false,
    taskStatus: false,
    membershipStatus: false,
    tags: false
  });
  const [expandedTagPaths, setExpandedTagPaths] = useState<Set<string>>(new Set());

  const availableColumns = useMemo(
    () => metadata?.activeDefinition.columns ?? [],
    [metadata?.activeDefinition.columns]
  );
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
  const selectedLabelProduct = useMemo(
    () =>
      MAIL_LABEL_PRODUCTS.find((entry) => entry.key === selectedLabelProductKey) ??
      MAIL_LABEL_PRODUCTS[0],
    [selectedLabelProductKey]
  );

  const filtersPayload = useMemo(
    () => ({
      entityType: filters.entityType.length > 0 ? filters.entityType : undefined,
      trackingStatus: filters.trackingStatus.length > 0 ? filters.trackingStatus : undefined,
      city: filters.city || undefined,
      state: filters.state || undefined,
      tagIds: selectedTagIds,
      taskStatus: filters.taskStatus.length > 0 ? filters.taskStatus : undefined,
      membershipStatus: filters.membershipStatus.length > 0 ? filters.membershipStatus : undefined
    }),
    [filters, selectedTagIds]
  );

  const isAllFieldsSelected =
    availableColumns.length > 0 && selectedFields.length === availableColumns.length;
  const membershipOptions = filterMap.get("membershipStatus")?.options ?? [];
  const recordTypeOptions = filterMap.get("entityType")?.options ?? [];
  const trackingOptions = filterMap.get("trackingStatus")?.options ?? [];
  const taskStatusOptions = filterMap.get("taskStatus")?.options ?? [];
  const tagTreeRoots = useMemo(() => {
    const nodesByPath = new Map<string, TagTreeNode>();
    const roots: TagTreeNode[] = [];
    const sortedRows = [...tagSummaryRows].sort((a, b) => a.tagPath.localeCompare(b.tagPath));
    for (const row of sortedRows) {
      const pathKey = row.tagPath || row.tagName;
      const parts = pathKey
        .split(" > ")
        .map((part) => part.trim())
        .filter(Boolean);
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join(" > ") : "";
      const node: TagTreeNode = {
        tagId: row.tagId,
        tagName: row.tagName,
        tagPath: pathKey,
        level: Math.max(1, row.level || parts.length || 1),
        pathKey,
        children: []
      };
      nodesByPath.set(pathKey, node);
      if (parentPath && nodesByPath.has(parentPath)) {
        nodesByPath.get(parentPath)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }, [tagSummaryRows]);

  const canNavigateBack = !reportRunLocked;
  const canGenerate = downloadJobs.length > 0 && reportRunLocked;
  const hasPendingJobs = downloadJobs.some((job) => job.status === "pending" || job.status === "building");

  function revokeDownloadUrls(jobs: DownloadJob[]) {
    for (const job of jobs) {
      if (job.url) URL.revokeObjectURL(job.url);
    }
  }

  function setJobState(jobKey: DownloadJobKey, patch: Partial<DownloadJob>) {
    setDownloadJobs((prev) =>
      prev.map((job) => (job.key === jobKey ? { ...job, ...patch } : job))
    );
  }

  function executeEditorCommand(command: string, value?: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    setLetterEditorHtml(editorRef.current.innerHTML);
  }

  function executeEditorToolbarCommand(
    event: MouseEvent<HTMLButtonElement | HTMLSelectElement>,
    command: string,
    value?: string
  ) {
    event.preventDefault();
    executeEditorCommand(command, value);
  }

  function toggleSection(section: keyof typeof filterSectionsOpen) {
    setFilterSectionsOpen((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  function sectionChevron(isOpen: boolean) {
    return isOpen ? "▾" : "▸";
  }

  function toggleMultiValueFilter(
    key: "entityType" | "trackingStatus" | "taskStatus" | "membershipStatus",
    value: string,
    checked: boolean
  ) {
    setFilters((prev) => {
      const current = new Set(prev[key]);
      if (checked) current.add(value);
      else current.delete(value);
      return { ...prev, [key]: Array.from(current) };
    });
  }

  function toggleTagFilter(tagId: string, checked: boolean) {
    setSelectedTagIds((prev) => {
      const current = new Set(prev);
      if (checked) current.add(tagId);
      else current.delete(tagId);
      return Array.from(current);
    });
  }

  function toggleTagPath(pathKey: string) {
    setExpandedTagPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }

  function stateFilterLabel() {
    const value = filters.state.trim();
    if (!value) return "blank";
    return value;
  }

  function renderTagNode(node: TagTreeNode, depth = 0) {
    const hasChildren = node.children.length > 0;
    const expanded = expandedTagPaths.has(node.pathKey);
    const indent = depth * 16;
    return (
      <div key={`${node.pathKey}-${node.tagId}`}>
        <div
          className="flex items-center gap-2 rounded px-1 py-1 text-sm text-slate-700 hover:bg-slate-50"
          style={{ paddingLeft: `${indent + 2}px` }}
          title={node.tagPath}
        >
          {hasChildren ? (
            <button
              type="button"
              className="w-4 text-left text-xs text-slate-600"
              onClick={() => toggleTagPath(node.pathKey)}
              aria-label={expanded ? `Collapse ${node.tagName}` : `Expand ${node.tagName}`}
            >
              {sectionChevron(expanded)}
            </button>
          ) : (
            <span className="inline-block w-4 text-slate-300">•</span>
          )}
          <input
            type="checkbox"
            checked={selectedTagIds.includes(node.tagId)}
            onChange={(event) => toggleTagFilter(node.tagId, event.target.checked)}
          />
          <span>{node.tagName}</span>
        </div>
        {hasChildren && expanded ? <div>{node.children.map((child) => renderTagNode(child, depth + 1))}</div> : null}
      </div>
    );
  }

  async function loadTagSummary() {
    if (loadingTagSummary) return;
    setLoadingTagSummary(true);
    try {
      const response = await fetch("/api/reports/tags/summary");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to load tags.");
      }
      const rows = (Array.isArray(payload?.summary) ? payload.summary : []) as Array<Record<string, unknown>>;
      const mapped = rows
        .map((row) => ({
          tagId: toText(row.tagId),
          tagName: toText(row.tagName),
          tagPath: toText(row.tagPath),
          level: Number(row.level ?? 0)
        }))
        .filter((row) => row.tagId && row.tagName)
        .sort((a, b) => a.tagPath.localeCompare(b.tagPath));
      setTagSummaryRows(mapped);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load tag filters.");
    } finally {
      setLoadingTagSummary(false);
    }
  }

  function applyTemplateSelection(templateId: string) {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return;
    setLetterPaperSize(template.paper_size);
    setLetterMargins({
      top: Number(template.margin_top_in ?? 0.5),
      left: Number(template.margin_left_in ?? 0.5),
      right: Number(template.margin_right_in ?? 0.5),
      bottom: Number(template.margin_bottom_in ?? 0.5)
    });
    setLetterEditorHtml(templateBodyToHtml(template.template_body || ""));
  }

  async function insertSignatureImage(file: File) {
    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setError("Please upload a PNG, JPG, or WEBP image.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Unable to read image file."));
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return;
    if (editorRef.current) {
      editorRef.current.focus();
    }
    document.execCommand(
      "insertHTML",
      false,
      `<img src="${dataUrl}" alt="Signature" style="max-width:220px;max-height:120px;display:block;margin:8px 0;" />`
    );
    if (editorRef.current) {
      setLetterEditorHtml(editorRef.current.innerHTML);
    }
  }

  async function saveTemplateIfRequested() {
    if (!saveAsTemplate) return;
    const templateName = newTemplateName.trim();
    if (!templateName) {
      throw new Error("Enter a template name before saving.");
    }
    setSavingTemplate(true);
    try {
      const response = await fetch("/api/mail-builder/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          paperSize: letterPaperSize,
          templateBody: letterEditorHtml,
          marginTopIn: letterMargins.top,
          marginLeftIn: letterMargins.left,
          marginRightIn: letterMargins.right,
          marginBottomIn: letterMargins.bottom,
          isActive: true
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to save template.");
      }
      const saved = payload?.template as Record<string, unknown> | null;
      if (!saved) return;
      const nextTemplate: MailTemplate = {
        id: toText(saved.id),
        name: toText(saved.name),
        paper_size: toText(saved.paper_size) as PaperSize,
        template_body: String(saved.template_body ?? ""),
        margin_top_in: Number(saved.margin_top_in ?? 0.5),
        margin_left_in: Number(saved.margin_left_in ?? 0.5),
        margin_right_in: Number(saved.margin_right_in ?? 0.5),
        margin_bottom_in: Number(saved.margin_bottom_in ?? 0.5)
      };
      setTemplates((prev) => {
        const deduped = prev.filter((entry) => entry.id !== nextTemplate.id);
        return [nextTemplate, ...deduped];
      });
      setSelectedTemplateId(nextTemplate.id);
      setSaveAsTemplate(false);
      setNewTemplateName("");
    } finally {
      setSavingTemplate(false);
    }
  }

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
  }

  async function loadTemplates() {
    if (templatesLoaded || loadingTemplates) return;
    setLoadingTemplates(true);
    try {
      const response = await fetch("/api/mail-builder/templates");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to load templates.");
      }
      const rows = Array.isArray(payload?.templates) ? payload.templates : [];
      const mappedTemplates = rows.map((row: unknown) => ({
        id: toText((row as { id?: unknown }).id),
        name: toText((row as { name?: unknown }).name),
        paper_size: toText((row as { paper_size?: unknown }).paper_size) as PaperSize,
        template_body: String((row as { template_body?: unknown }).template_body ?? ""),
        margin_top_in: Number((row as { margin_top_in?: unknown }).margin_top_in ?? 0.5),
        margin_left_in: Number((row as { margin_left_in?: unknown }).margin_left_in ?? 0.5),
        margin_right_in: Number((row as { margin_right_in?: unknown }).margin_right_in ?? 0.5),
        margin_bottom_in: Number((row as { margin_bottom_in?: unknown }).margin_bottom_in ?? 0.5)
      }));
      setTemplates(mappedTemplates);
      setTemplatesLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load templates.");
    } finally {
      setLoadingTemplates(false);
    }
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

  async function buildExportBlob(format: "csv" | "excel") {
    const response = await fetch("/api/reports/export", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportType: "contacts",
        selectedColumns: selectedFields,
        filters: filtersPayload,
        format,
        executionMetadata: {
          report_mode: reportMode,
          workflow: "constituent_report_builder",
          selected_columns: selectedFields,
          filters: filtersPayload
        }
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
    const contactRows = (payload?.rows ?? []) as Array<Record<string, unknown>>;
    const document = new jsPDF({ unit: "pt", format: "letter" });
    const pageHeight = document.internal.pageSize.getHeight();
    const marginLeft = 36;
    const marginTop = 42;
    const contentWidth = document.internal.pageSize.getWidth() - marginLeft * 2;
    let y = marginTop;

    for (let index = 0; index < contactRows.length; index += 1) {
      const row = contactRows[index];
      const name = toText(row.name) || "-";
      const phone = toText(row.phone) || "-";
      const email = toText(row.email) || "-";
      const address = toText(row.address) || "-";
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
      const wrappedHeadline = document.splitTextToSize(`${name}  •  ${phone}  •  ${email}`, contentWidth);
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
          const createdAt = toText(activity.createdAt).slice(0, 10);
          const actionType = toText(activity.actionType);
          const summary = toText(activity.summary);
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

  function applyLetterTokens(templateHtml: string, row: Record<string, unknown>) {
    const today = new Date().toLocaleDateString();
    const replacements: Record<string, string> = {
      today,
      name: toText(row.name),
      phone: toText(row.phone),
      email: toText(row.email),
      address: [toText(row.address), toText(row.city), toText(row.state), toText(row.zip)]
        .filter(Boolean)
        .join(", "),
      city: toText(row.city),
      state: toText(row.state),
      zip: toText(row.zip)
    };
    return templateHtml.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, token: string) => {
      return replacements[token.toLowerCase()] ?? "";
    });
  }

  function htmlToPrintableLines(html: string) {
    const container = document.createElement("div");
    container.innerHTML = html;
    const raw = container.innerText.replace(/\r/g, "");
    return raw.split("\n").map((line) => line.trim());
  }

  function extractInlineImages(html: string) {
    const container = document.createElement("div");
    container.innerHTML = html;
    return Array.from(container.querySelectorAll("img[src]"))
      .map((img) => String(img.getAttribute("src") ?? ""))
      .filter((src) => src.startsWith("data:image/"));
  }

  async function buildLetterMailerPdfBlob() {
    const recipientRows = await fetchFilteredConstituentsForMailer();
    const pageFormat = paperSizePoints(letterPaperSize);
    const documentPdf = new jsPDF({ unit: "pt", format: pageFormat });
    const marginPoints = {
      top: Math.max(0, Number(letterMargins.top || 0)) * 72,
      left: Math.max(0, Number(letterMargins.left || 0)) * 72,
      right: Math.max(0, Number(letterMargins.right || 0)) * 72,
      bottom: Math.max(0, Number(letterMargins.bottom || 0)) * 72
    };
    const contentWidth = documentPdf.internal.pageSize.getWidth() - marginPoints.left - marginPoints.right;
    const pageHeight = documentPdf.internal.pageSize.getHeight();
    if (recipientRows.length === 0) {
      documentPdf.setFont("helvetica", "normal");
      documentPdf.setFontSize(11);
      documentPdf.text("No matching recipients found.", marginPoints.left, marginPoints.top + 14);
      return documentPdf.output("blob");
    }
    for (let index = 0; index < recipientRows.length; index += 1) {
      if (index > 0) {
        documentPdf.addPage(pageFormat);
      }
      const mergedHtml = applyLetterTokens(letterEditorHtml, recipientRows[index]);
      const lines = htmlToPrintableLines(mergedHtml);
      const images = extractInlineImages(mergedHtml);
      let y = marginPoints.top + 14;
      const lineHeight = 14;
      documentPdf.setFont("helvetica", "normal");
      documentPdf.setFontSize(11);
      for (const line of lines) {
        if (!line) {
          y += lineHeight;
          continue;
        }
        const wrapped = documentPdf.splitTextToSize(line, contentWidth);
        for (const wrappedLine of wrapped) {
          if (y + lineHeight > pageHeight - marginPoints.bottom) {
            documentPdf.addPage(pageFormat);
            y = marginPoints.top + 14;
          }
          documentPdf.text(String(wrappedLine), marginPoints.left, y);
          y += lineHeight;
        }
      }
      for (const imageSrc of images) {
        const imageType = imageSrc.startsWith("data:image/png")
          ? "PNG"
          : imageSrc.startsWith("data:image/webp")
            ? "WEBP"
            : "JPEG";
        const imageWidth = 180;
        const imageHeight = 60;
        if (y + imageHeight > pageHeight - marginPoints.bottom) {
          documentPdf.addPage(pageFormat);
          y = marginPoints.top + 14;
        }
        try {
          documentPdf.addImage(imageSrc, imageType, marginPoints.left, y, imageWidth, imageHeight);
          y += imageHeight + 8;
        } catch {
          // Ignore unsupported embedded images without breaking PDF generation.
        }
      }
    }
    return documentPdf.output("blob");
  }

  async function buildLabelMailerPdfBlob() {
    const recipientRows = await fetchFilteredConstituentsForMailer();
    const perSheet = selectedLabelProduct.columns * selectedLabelProduct.rows;
    const sheets = chunkArray(recipientRows, perSheet);
    const document = new jsPDF({
      unit: "in",
      format: [selectedLabelProduct.pageWidthIn, selectedLabelProduct.pageHeightIn]
    });
    if (sheets.length === 0) {
      document.setFont("helvetica", "normal");
      document.setFontSize(12);
      document.text("No matching recipients found.", 0.75, 1);
      return document.output("blob");
    }
    for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
      if (sheetIndex > 0) {
        document.addPage([selectedLabelProduct.pageWidthIn, selectedLabelProduct.pageHeightIn]);
      }
      const sheetRows = sheets[sheetIndex];
      for (let itemIndex = 0; itemIndex < sheetRows.length; itemIndex += 1) {
        const row = sheetRows[itemIndex];
        const column = itemIndex % selectedLabelProduct.columns;
        const rowNumber = Math.floor(itemIndex / selectedLabelProduct.columns);
        const originX =
          selectedLabelProduct.leftMarginIn +
          labelMargins.left +
          column * (selectedLabelProduct.labelWidthIn + selectedLabelProduct.horizontalGapIn);
        const originY =
          selectedLabelProduct.topMarginIn +
          labelMargins.top +
          rowNumber * (selectedLabelProduct.labelHeightIn + selectedLabelProduct.verticalGapIn);
        const innerX = originX + 0.08;
        let innerY = originY + 0.13;
        const textWidth = Math.max(0.4, selectedLabelProduct.labelWidthIn - 0.16);
        const name = toText(row.name) || "-";
        const address = [toText(row.address), toText(row.city), toText(row.state), toText(row.zip)]
          .filter(Boolean)
          .join(", ");
        document.setFont("helvetica", "bold");
        document.setFontSize(10);
        const nameLines = document.splitTextToSize(name, textWidth);
        const limitedNameLines = Array.isArray(nameLines) ? nameLines.slice(0, 2) : [String(nameLines)];
        document.text(limitedNameLines, innerX, innerY);
        innerY += limitedNameLines.length * 0.14 + 0.03;
        document.setFont("helvetica", "normal");
        document.setFontSize(9);
        const addressLines = document.splitTextToSize(address || "-", textWidth);
        const limitedAddressLines = Array.isArray(addressLines)
          ? addressLines.slice(0, 4)
          : [String(addressLines)];
        document.text(limitedAddressLines, innerX, innerY);
      }
    }
    return document.output("blob");
  }

  async function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Unable to encode generated report."));
      reader.readAsDataURL(blob);
    });
  }

  async function registerPdfRunHistory(job: Pick<DownloadJob, "key" | "label" | "fileName">, blob: Blob) {
    const dataUrl = await blobToDataUrl(blob);
    await fetch("/api/reports/history/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        reportType: "contacts",
        outputKey: job.key,
        outputLabel: job.label,
        fileName: job.fileName,
        fileDataUrl: dataUrl,
        rowCount: totalCount,
        selectedColumns: selectedFields,
        filters: filtersPayload,
        reportMode
      })
    });
  }

  function buildPlannedJobs() {
    const jobs: Array<Pick<DownloadJob, "key" | "label" | "fileName">> = [];
    if (canExportExcel) {
      jobs.push({
        key: "excel",
        label: "Simple Excel Export",
        fileName: "constituent-report.xlsx"
      });
    }
    if (canExportCsv) {
      jobs.push({
        key: "csv",
        label: "Simple CSV Export",
        fileName: "constituent-report.csv"
      });
    }
    if (includeActivitiesReport === "yes") {
      jobs.push({
        key: "activities",
        label: "Activities Report",
        fileName: "constituent-activities-report.pdf"
      });
    }
    if (includeLetterMailer === "yes") {
      jobs.push({
        key: "letter",
        label: "Letter Mailer",
        fileName: "constituent-letter-mailer.pdf"
      });
    }
    if (includeLabelMailer === "yes") {
      jobs.push({
        key: "labels",
        label: "Label Mailer",
        fileName: "constituent-label-mailer.pdf"
      });
    }
    return jobs;
  }

  async function startGeneration() {
    const planned = buildPlannedJobs();
    if (planned.length === 0) {
      setError("No report outputs are available to generate.");
      return;
    }
    setError(null);
    setReportRunLocked(true);
    setLoadingGeneration(true);
    revokeDownloadUrls(downloadJobs);
    setDownloadJobs(
      planned.map((job) => ({
        ...job,
        status: "pending",
        url: null
      }))
    );
    setStep("generate");

    for (const job of planned) {
      setJobState(job.key, { status: "building", message: undefined });
      try {
        let blob: Blob;
        if (job.key === "excel") {
          blob = await buildExportBlob("excel");
        } else if (job.key === "csv") {
          blob = await buildExportBlob("csv");
        } else if (job.key === "activities") {
          blob = await buildActivityReportPdfBlob();
        } else if (job.key === "letter") {
          blob = await buildLetterMailerPdfBlob();
        } else {
          blob = await buildLabelMailerPdfBlob();
        }
        if (job.key === "activities" || job.key === "letter" || job.key === "labels") {
          try {
            await registerPdfRunHistory(job, blob);
          } catch {
            // Keep the generated download available even if history persistence fails.
          }
        }
        const url = URL.createObjectURL(blob);
        setJobState(job.key, { status: "ready", url });
      } catch (jobError) {
        setJobState(job.key, {
          status: "error",
          message: jobError instanceof Error ? jobError.message : "Unable to generate output."
        });
      }
    }

    setLoadingGeneration(false);
  }

  function downloadJob(job: DownloadJob) {
    if (!job.url || job.status !== "ready") return;
    const link = document.createElement("a");
    link.href = job.url;
    link.download = job.fileName;
    link.click();
  }

  function navigateAfterMailerStep() {
    if (includeLetterMailer === "yes") {
      setStep("letterSetup");
      return;
    }
    if (includeLabelMailer === "yes") {
      setStep("labelSetup");
      return;
    }
    setStep("generate");
  }

  async function navigateAfterLetterSetupStep() {
    try {
      setError(null);
      await saveTemplateIfRequested();
      if (includeLabelMailer === "yes") {
        setStep("labelSetup");
        return;
      }
      setStep("generate");
    } catch (navigationError) {
      setError(
        navigationError instanceof Error
          ? navigationError.message
          : "Unable to continue from letter setup."
      );
    }
  }

  function navigateBackFromLabelSetup() {
    if (includeLetterMailer === "yes") {
      setStep("letterSetup");
      return;
    }
    setStep("mailer");
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
    if (step === "letterSetup") {
      void loadTemplates();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step === "filters" && reportMode === "constituent" && tagSummaryRows.length === 0) {
      void loadTagSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, reportMode, tagSummaryRows.length]);

  useEffect(() => {
    if (step !== "letterSetup" || !editorRef.current) return;
    if (editorRef.current.innerHTML !== letterEditorHtml) {
      editorRef.current.innerHTML = letterEditorHtml;
    }
  }, [step, letterEditorHtml]);

  useEffect(() => {
    return () => {
      revokeDownloadUrls(downloadJobs);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {step === "filters" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <div className="rounded-lg border border-brand-200 bg-gradient-to-r from-brand-50 to-white p-4">
            <p className="mb-3 text-base font-semibold text-brand-900">Step 1: Choose Report Type</p>
            <div className="grid gap-3 md:grid-cols-3">
              {(
                [
                  { key: "constituent", title: "Constituent Report", subtitle: "Contacts, donors, and organizations" },
                  { key: "transaction", title: "Transaction Report", subtitle: "Gifts, payments, and activity" },
                  { key: "project", title: "Project Report", subtitle: "Project execution and staffing" }
                ] as const
              ).map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  className={`rounded-lg border px-4 py-3 text-left transition ${
                    reportMode === mode.key
                      ? "border-brand-500 bg-brand-100 shadow-sm"
                      : "border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/50"
                  }`}
                  onClick={() => setReportMode(mode.key)}
                >
                  <p className="text-sm font-semibold text-slate-900">{mode.title}</p>
                  <p className="mt-1 text-xs text-slate-600">{mode.subtitle}</p>
                </button>
              ))}
            </div>
          </div>

          {reportMode !== "constituent" ? (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
              {reportMode === "transaction" ? "Transaction Report" : "Project Report"} steps will be configured next.
            </div>
          ) : (
            <>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-900">Constituent Filters</p>
                <div className="space-y-3">
                  <section className="rounded-md border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-900"
                      onClick={() => toggleSection("city")}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 text-xs text-slate-500">{sectionChevron(filterSectionsOpen.city)}</span>
                        <span>City</span>
                      </span>
                      <span className="text-xs text-slate-500">{filters.city.trim() || "blank"}</span>
                    </button>
                    {filterSectionsOpen.city ? (
                      <div className="border-t border-slate-200 px-3 py-3">
                        <Input
                          value={filters.city}
                          onChange={(event) => setFilters((prev) => ({ ...prev, city: event.target.value }))}
                          placeholder="Type city..."
                        />
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-md border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-900"
                      onClick={() => toggleSection("state")}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 text-xs text-slate-500">{sectionChevron(filterSectionsOpen.state)}</span>
                        <span>State</span>
                      </span>
                      <span className="text-xs text-slate-500">{stateFilterLabel()}</span>
                    </button>
                    {filterSectionsOpen.state ? (
                      <div className="border-t border-slate-200 px-3 py-3">
                        <select
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          value={filters.state}
                          onChange={(event) => setFilters((prev) => ({ ...prev, state: event.target.value }))}
                        >
                          <option value="">Blank</option>
                          {US_STATES.map((stateOption) => (
                            <option key={stateOption.code} value={stateOption.name}>
                              {stateOption.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-md border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-900"
                      onClick={() => toggleSection("entityType")}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 text-xs text-slate-500">{sectionChevron(filterSectionsOpen.entityType)}</span>
                        <span>Entity Type</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {filters.entityType.length > 0 ? `${filters.entityType.length} selected` : "None selected"}
                      </span>
                    </button>
                    {filterSectionsOpen.entityType ? (
                      <div className="grid gap-2 border-t border-slate-200 px-3 py-3 md:grid-cols-2">
                        {recordTypeOptions.map((option) => (
                          <label key={option.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={filters.entityType.includes(option.value)}
                              onChange={(event) =>
                                toggleMultiValueFilter("entityType", option.value, event.target.checked)
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-md border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-900"
                      onClick={() => toggleSection("trackingStatus")}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 text-xs text-slate-500">
                          {sectionChevron(filterSectionsOpen.trackingStatus)}
                        </span>
                        <span>Tracking Status</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {filters.trackingStatus.length > 0
                          ? `${filters.trackingStatus.length} selected`
                          : "None selected"}
                      </span>
                    </button>
                    {filterSectionsOpen.trackingStatus ? (
                      <div className="grid gap-2 border-t border-slate-200 px-3 py-3 md:grid-cols-2">
                        {trackingOptions.map((option) => (
                          <label key={option.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={filters.trackingStatus.includes(option.value)}
                              onChange={(event) =>
                                toggleMultiValueFilter("trackingStatus", option.value, event.target.checked)
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-md border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-900"
                      onClick={() => toggleSection("taskStatus")}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 text-xs text-slate-500">{sectionChevron(filterSectionsOpen.taskStatus)}</span>
                        <span>Tasks by Status</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {filters.taskStatus.length > 0 ? `${filters.taskStatus.length} selected` : "None selected"}
                      </span>
                    </button>
                    {filterSectionsOpen.taskStatus ? (
                      <div className="grid gap-2 border-t border-slate-200 px-3 py-3 md:grid-cols-2">
                        {taskStatusOptions.map((option) => (
                          <label key={option.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={filters.taskStatus.includes(option.value)}
                              onChange={(event) =>
                                toggleMultiValueFilter("taskStatus", option.value, event.target.checked)
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-md border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-900"
                      onClick={() => toggleSection("membershipStatus")}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 text-xs text-slate-500">
                          {sectionChevron(filterSectionsOpen.membershipStatus)}
                        </span>
                        <span>Memberships</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {filters.membershipStatus.length > 0
                          ? `${filters.membershipStatus.length} selected`
                          : "None selected"}
                      </span>
                    </button>
                    {filterSectionsOpen.membershipStatus ? (
                      <div className="grid gap-2 border-t border-slate-200 px-3 py-3 md:grid-cols-2">
                        {membershipOptions.map((option) => (
                          <label key={option.value} className="inline-flex items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={filters.membershipStatus.includes(option.value)}
                              onChange={(event) =>
                                toggleMultiValueFilter("membershipStatus", option.value, event.target.checked)
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                  </section>

                  <section className="rounded-md border border-slate-200">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-slate-900"
                      onClick={() => toggleSection("tags")}
                    >
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 text-xs text-slate-500">{sectionChevron(filterSectionsOpen.tags)}</span>
                        <span>Tags (Hierarchy)</span>
                      </span>
                      <span className="text-xs text-slate-500">
                        {selectedTagIds.length > 0 ? `${selectedTagIds.length} selected` : "None selected"}
                      </span>
                    </button>
                    {filterSectionsOpen.tags ? (
                      <div className="border-t border-slate-200 px-3 py-3">
                        {loadingTagSummary ? (
                          <p className="text-sm text-slate-500">Loading tags...</p>
                        ) : tagSummaryRows.length === 0 ? (
                          <p className="text-sm text-slate-500">No tags available.</p>
                        ) : (
                          <div className="max-h-56 space-y-1 overflow-auto rounded-md border border-slate-200 p-2">
                            {tagTreeRoots.map((node) => renderTagNode(node))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </section>
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
                        entityType: [],
                        trackingStatus: [],
                        city: "",
                        state: "",
                        taskStatus: [],
                        membershipStatus: []
                      });
                      setSelectedTagIds([]);
                      setExpandedTagPaths(new Set());
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
              onChange={(event) => {
                if (event.target.checked) {
                  setSelectedFields(availableColumns.map((column) => column.key));
                } else {
                  setSelectedFields([]);
                }
              }}
            />
            Select All
          </label>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {availableColumns.map((column) => (
              <label key={column.key} className="flex items-center gap-2 rounded-md border border-slate-200 p-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedFields.includes(column.key)}
                  onChange={() =>
                    setSelectedFields((prev) =>
                      prev.includes(column.key)
                        ? prev.filter((entry) => entry !== column.key)
                        : [...prev, column.key]
                    )
                  }
                />
                {column.label}
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" disabled={!canNavigateBack} onClick={() => setStep("filters")}>
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
            Step 3: Do you want to include an Activities Report as well?
          </p>
          <div className="flex gap-3">
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="include-activities"
                checked={includeActivitiesReport === "yes"}
                onChange={() => setIncludeActivitiesReport("yes")}
              />
              Yes
            </label>
            <label className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
              <input
                type="radio"
                name="include-activities"
                checked={includeActivitiesReport === "no"}
                onChange={() => setIncludeActivitiesReport("no")}
              />
              No
            </label>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!canNavigateBack} onClick={() => setStep("fields")}>
              Back to Fields
            </Button>
            <Button type="button" onClick={() => setStep("mailer")}>
              Continue to Step 4
            </Button>
          </div>
        </section>
      ) : null}

      {step === "mailer" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">
            Step 4: Do you want to print off letters and labels?
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">You like to print a mail letter?</p>
              <div className="flex gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="letter-mailer"
                    checked={includeLetterMailer === "yes"}
                    onChange={() => setIncludeLetterMailer("yes")}
                  />
                  Yes
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="letter-mailer"
                    checked={includeLetterMailer === "no"}
                    onChange={() => setIncludeLetterMailer("no")}
                  />
                  No
                </label>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="mb-1 text-xs font-medium text-slate-600">Will you need to print mailing labels?</p>
              <div className="flex gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="label-mailer"
                    checked={includeLabelMailer === "yes"}
                    onChange={() => setIncludeLabelMailer("yes")}
                  />
                  Yes
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="label-mailer"
                    checked={includeLabelMailer === "no"}
                    onChange={() => setIncludeLabelMailer("no")}
                  />
                  No
                </label>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!canNavigateBack} onClick={() => setStep("activities")}>
              Back to Step 3
            </Button>
            <Button type="button" onClick={navigateAfterMailerStep}>
              Continue
            </Button>
          </div>
        </section>
      ) : null}

      {step === "letterSetup" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Step 5: Set up the letter mailer</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Template</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={selectedTemplateId}
                onChange={(event) => applyTemplateSelection(event.target.value)}
              >
                <option value="">No template</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              {loadingTemplates ? <p className="mt-1 text-xs text-slate-500">Loading templates...</p> : null}
              <p className="mt-1 text-xs text-slate-500">
                Pick an existing template or keep &quot;No template&quot; and design your own.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Page Size</label>
              <select
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={letterPaperSize}
                onChange={(event) => setLetterPaperSize(event.target.value as PaperSize)}
              >
                {PAPER_SIZE_OPTIONS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={(event) => setSaveAsTemplate(event.target.checked)}
              />
              Save this as a new template
            </label>
            {saveAsTemplate ? (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-slate-600">New Template Name</label>
                <Input
                  value={newTemplateName}
                  onChange={(event) => setNewTemplateName(event.target.value)}
                  placeholder="Example: Year-End Thank You Letter"
                />
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Text Editor</p>
            <div className="mb-2 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onMouseDown={(event) => executeEditorToolbarCommand(event, "bold")}
              >
                Bold
              </Button>
              <Button
                type="button"
                variant="secondary"
                onMouseDown={(event) => executeEditorToolbarCommand(event, "italic")}
              >
                Italic
              </Button>
              <Button
                type="button"
                variant="secondary"
                onMouseDown={(event) => executeEditorToolbarCommand(event, "underline")}
              >
                Underline
              </Button>
              <Button
                type="button"
                variant="secondary"
                onMouseDown={(event) => executeEditorToolbarCommand(event, "insertUnorderedList")}
              >
                Bullets
              </Button>
              <Button
                type="button"
                variant="secondary"
                onMouseDown={(event) => executeEditorToolbarCommand(event, "insertOrderedList")}
              >
                Numbered
              </Button>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={editorFontFamily}
                onChange={(event) => {
                  setEditorFontFamily(event.target.value);
                  executeEditorCommand("fontName", event.target.value);
                }}
              >
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
                <option value="Brush Script MT">Brush Script MT</option>
                <option value="Lucida Handwriting">Lucida Handwriting</option>
                <option value="Comic Sans MS">Comic Sans MS</option>
              </select>
              <label className="inline-flex cursor-pointer items-center rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                Upload Signature Image
                <input
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void insertSignatureImage(file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
            <div
              ref={editorRef}
              className="min-h-48 rounded-md border border-slate-300 px-3 py-2 text-sm focus-within:ring-1 focus-within:ring-brand-300"
              contentEditable
              suppressContentEditableWarning
              style={{ fontFamily: editorFontFamily }}
              onInput={(event) => setLetterEditorHtml((event.target as HTMLDivElement).innerHTML)}
            />
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">Page Margins (inches, defaults to 0.5)</p>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Top Margin</label>
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  value={letterMargins.top}
                  onChange={(event) =>
                    setLetterMargins((prev) => ({ ...prev, top: Number(event.target.value || 0) }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Right Margin</label>
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  value={letterMargins.right}
                  onChange={(event) =>
                    setLetterMargins((prev) => ({ ...prev, right: Number(event.target.value || 0) }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Bottom Margin</label>
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  value={letterMargins.bottom}
                  onChange={(event) =>
                    setLetterMargins((prev) => ({ ...prev, bottom: Number(event.target.value || 0) }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Left Margin</label>
                <Input
                  type="number"
                  step="0.05"
                  min={0}
                  value={letterMargins.left}
                  onChange={(event) =>
                    setLetterMargins((prev) => ({ ...prev, left: Number(event.target.value || 0) }))
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!canNavigateBack} onClick={() => setStep("mailer")}>
              Back to Step 4
            </Button>
            <Button type="button" onClick={() => void navigateAfterLetterSetupStep()} disabled={savingTemplate}>
              {savingTemplate ? "Saving template..." : "Continue"}
            </Button>
          </div>

          <div className="rounded-md border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Token Reference
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="px-3 py-2">Token</th>
                    <th className="px-3 py-2">Field Name</th>
                    <th className="px-3 py-2">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {LETTER_TOKEN_REFERENCE.map((entry) => (
                    <tr key={entry.token} className="border-b border-slate-100">
                      <td className="px-3 py-2">
                        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{entry.token}</code>
                      </td>
                      <td className="px-3 py-2 text-slate-700">{entry.fieldName}</td>
                      <td className="px-3 py-2 text-slate-600">{entry.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ) : null}

      {step === "labelSetup" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Step 6: Set up labels</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Label Product</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={selectedLabelProductKey}
              onChange={(event) => setSelectedLabelProductKey(event.target.value)}
            >
              {MAIL_LABEL_PRODUCTS.map((product) => (
                <option key={product.key} value={product.key}>
                  {product.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Includes Avery plus common generic and shipping label layouts.
            </p>
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
            <p>
              {`Layout: ${selectedLabelProduct.columns} columns × ${selectedLabelProduct.rows} rows (${selectedLabelProduct.labelWidthIn}" × ${selectedLabelProduct.labelHeightIn}")`}
            </p>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">Additional Margins (inches)</p>
            <div className="grid gap-3 md:grid-cols-4">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={labelMargins.top}
                onChange={(event) =>
                  setLabelMargins((prev) => ({ ...prev, top: Number(event.target.value || 0) }))
                }
                placeholder="Top"
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={labelMargins.right}
                onChange={(event) =>
                  setLabelMargins((prev) => ({ ...prev, right: Number(event.target.value || 0) }))
                }
                placeholder="Right"
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={labelMargins.bottom}
                onChange={(event) =>
                  setLabelMargins((prev) => ({ ...prev, bottom: Number(event.target.value || 0) }))
                }
                placeholder="Bottom"
              />
              <Input
                type="number"
                step="0.01"
                min={0}
                value={labelMargins.left}
                onChange={(event) =>
                  setLabelMargins((prev) => ({ ...prev, left: Number(event.target.value || 0) }))
                }
                placeholder="Left"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" disabled={!canNavigateBack} onClick={navigateBackFromLabelSetup}>
              Back
            </Button>
            <Button type="button" onClick={() => setStep("generate")}>
              Continue to Step 7
            </Button>
          </div>
        </section>
      ) : null}

      {step === "generate" ? (
        <section className="space-y-4 rounded-md border border-slate-200 p-4">
          <p className="text-sm font-semibold text-slate-900">Step 7: Generate and Download Reports</p>

          {!reportRunLocked ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!canNavigateBack}
                onClick={() => {
                  if (includeLabelMailer === "yes") setStep("labelSetup");
                  else if (includeLetterMailer === "yes") setStep("letterSetup");
                  else setStep("mailer");
                }}
              >
                Back
              </Button>
              <Button type="button" onClick={() => void startGeneration()}>
                Run Report
              </Button>
            </div>
          ) : null}

          {canGenerate ? (
            <div className="rounded-md border border-slate-200 p-4">
              <p className="text-lg font-semibold text-slate-900">
                {hasPendingJobs
                  ? "Please wait, your reports are generating"
                  : "Congratulations, your reports are completed"}
              </p>
              {hasPendingJobs ? (
                <div className="mt-2 flex items-center gap-1 text-2xl text-brand-600">
                  <span className="animate-bounce">.</span>
                  <span className="animate-bounce [animation-delay:120ms]">.</span>
                  <span className="animate-bounce [animation-delay:240ms]">.</span>
                </div>
              ) : null}
              {hasPendingJobs ? (
                <p className="mt-2 text-xs text-slate-500">
                  Please stay on this page while outputs generate. After completion, you can leave and re-download from
                  Report History.
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  You can leave this page now. Completed files are available here and in Report History.
                </p>
              )}
              {loadingGeneration ? (
                <p className="mt-2 text-xs text-slate-500">Processing outputs...</p>
              ) : null}
            </div>
          ) : null}

          {downloadJobs.length > 0 ? (
            <div className="grid gap-2">
              {downloadJobs.map((job) => {
                const isReady = job.status === "ready" && Boolean(job.url);
                return (
                  <div
                    key={job.key}
                    className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{job.label}</p>
                      <p className="text-xs text-slate-500">
                        {job.status === "pending"
                          ? "Pending"
                          : job.status === "building"
                            ? "Generating..."
                            : job.status === "ready"
                              ? "Ready"
                              : job.message || "Failed"}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!isReady}
                      onClick={() => downloadJob(job)}
                      className={`rounded-md px-3 py-2 text-sm font-semibold ${
                        isReady
                          ? "bg-brand-600 text-white hover:bg-brand-700"
                          : "cursor-not-allowed bg-slate-200 text-slate-500"
                      }`}
                    >
                      Download
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
