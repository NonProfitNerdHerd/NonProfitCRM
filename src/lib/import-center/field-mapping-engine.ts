import {
  CONTACT_STANDARD_FIELDS,
  type ContactStandardFieldDefinition,
  type ImportCenterMapping
} from "@/lib/import-center/types";
import {
  buildDefaultMappingTransform,
  resolveMappingTransform,
  type ResolvedImportCenterMappingTransform
} from "@/lib/import-center/mapping-transform";

export function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

export function suggestStandardField(header: string): ContactStandardFieldDefinition | null {
  const normalized = normalizeHeader(header);
  if (["tags", "tag", "groups", "group"].includes(normalized)) {
    return CONTACT_STANDARD_FIELDS.find((field) => field.key === "tags") ?? null;
  }
  return (
    CONTACT_STANDARD_FIELDS.find((field) => normalizeHeader(field.key) === normalized) ??
    CONTACT_STANDARD_FIELDS.find((field) => normalizeHeader(field.label) === normalized) ??
    null
  );
}

export function buildSuggestedMappings(headers: string[]): ImportCenterMapping[] {
  return headers.map((header) => {
    const suggestion = suggestStandardField(header);
    if (suggestion?.key === "tags") {
      return {
        sourceHeader: header,
        targetType: "tags",
        targetKey: "tags",
        transform: buildDefaultMappingTransform("tags")
      } satisfies ImportCenterMapping;
    }
    if (suggestion) {
      return {
        sourceHeader: header,
        targetType: "standard",
        targetKey: suggestion.key
      } satisfies ImportCenterMapping;
    }
    return {
      sourceHeader: header,
      targetType: "unmapped",
      targetKey: null
    } satisfies ImportCenterMapping;
  });
}

export function sanitizeInternalKey(label: string) {
  const normalized = normalizeHeader(label).replace(/^_+|_+$/g, "");
  return normalized || `field_${Date.now()}`;
}

export function mappingSummary(mappings: ImportCenterMapping[]) {
  return mappings.reduce(
    (acc, mapping) => {
      if (mapping.targetType === "unmapped" || !mapping.targetKey) {
        acc.unmapped += 1;
      } else if (mapping.targetType === "standard") {
        acc.standard += 1;
      } else if (mapping.targetType === "custom") {
        acc.custom += 1;
      } else if (mapping.targetType === "tags") {
        acc.tags += 1;
      }
      return acc;
    },
    { standard: 0, custom: 0, tags: 0, unmapped: 0 }
  );
}

export function mapRowToTargets(
  row: Record<string, unknown>,
  mappings: ImportCenterMapping[]
): {
  standard: Record<string, unknown>;
  custom: Record<string, unknown>;
  tags: Array<{
    sourceHeader: string;
    rawValue: unknown;
    transform: ResolvedImportCenterMappingTransform;
  }>;
} {
  const standard: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  const tags: Array<{
    sourceHeader: string;
    rawValue: unknown;
    transform: ResolvedImportCenterMappingTransform;
  }> = [];

  for (const mapping of mappings) {
    const raw = row[mapping.sourceHeader];
    if (mapping.targetType === "unmapped") continue;
    if (mapping.targetType === "tags") {
      tags.push({
        sourceHeader: mapping.sourceHeader,
        rawValue: raw,
        transform: resolveMappingTransform({ mapping })
      });
      continue;
    }
    if (!mapping.targetKey) continue;
    if (mapping.targetType === "standard") {
      standard[mapping.targetKey] = raw;
      continue;
    }
    if (mapping.targetType === "custom") {
      custom[mapping.targetKey] = raw;
    }
  }

  return { standard, custom, tags };
}
