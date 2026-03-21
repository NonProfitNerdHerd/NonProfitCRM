import type {
  ImportCenterMapping,
  ImportCenterMappingTransform,
  ImportCenterMappingTargetType
} from "@/lib/import-center/types";

function toText(value: unknown) {
  return String(value ?? "");
}

function toTrimmed(value: unknown) {
  return String(value ?? "").trim();
}

export type ResolvedImportCenterMappingTransform = {
  valueHandlingMode: "direct_value" | "multi_value_split" | "relation_lookup" | "relation_lookup_or_create";
  split: {
    enabled: boolean;
    delimiterPreset: "semicolon" | "comma" | "pipe" | "custom";
    delimiterValue: string | null;
    trimWhitespace: boolean;
    ignoreBlankValues: boolean;
  };
  relatedRecord: {
    lookupExisting: boolean;
    onMissing: "fail_row" | "skip_value" | "create";
    caseInsensitiveMatch: boolean;
    normalizeTrim: boolean;
  };
  applyBehavior: "append" | "replace";
};

export const DEFAULT_TAGS_MAPPING_TRANSFORM: ResolvedImportCenterMappingTransform = {
  valueHandlingMode: "multi_value_split",
  split: {
    enabled: true,
    delimiterPreset: "semicolon",
    delimiterValue: ";",
    trimWhitespace: true,
    ignoreBlankValues: true
  },
  relatedRecord: {
    lookupExisting: true,
    onMissing: "create",
    caseInsensitiveMatch: true,
    normalizeTrim: true
  },
  applyBehavior: "append"
};

export const DEFAULT_DIRECT_MAPPING_TRANSFORM: ResolvedImportCenterMappingTransform = {
  valueHandlingMode: "direct_value",
  split: {
    enabled: false,
    delimiterPreset: "semicolon",
    delimiterValue: ";",
    trimWhitespace: true,
    ignoreBlankValues: true
  },
  relatedRecord: {
    lookupExisting: false,
    onMissing: "skip_value",
    caseInsensitiveMatch: true,
    normalizeTrim: true
  },
  applyBehavior: "append"
};

export function buildDefaultMappingTransform(targetType: ImportCenterMappingTargetType) {
  return targetType === "tags"
    ? { ...DEFAULT_TAGS_MAPPING_TRANSFORM, split: { ...DEFAULT_TAGS_MAPPING_TRANSFORM.split } }
    : { ...DEFAULT_DIRECT_MAPPING_TRANSFORM, split: { ...DEFAULT_DIRECT_MAPPING_TRANSFORM.split } };
}

export function resolveSplitDelimiter(
  split: ResolvedImportCenterMappingTransform["split"],
  fallbackDelimiter?: string | null
) {
  const fallback = toTrimmed(fallbackDelimiter) || ";";
  if (split.delimiterPreset === "comma") return ",";
  if (split.delimiterPreset === "pipe") return "|";
  if (split.delimiterPreset === "semicolon") return ";";
  const custom = toText(split.delimiterValue);
  return custom || fallback;
}

export function resolveMappingTransform(input: {
  mapping: Partial<ImportCenterMapping> | null | undefined;
  fallbackDelimiter?: string | null;
}): ResolvedImportCenterMappingTransform {
  const targetType = (input.mapping?.targetType ?? "standard") as ImportCenterMappingTargetType;
  const transform = (input.mapping?.transform ?? {}) as ImportCenterMappingTransform;
  const defaults = buildDefaultMappingTransform(targetType);
  const delimiterValue =
    toText(transform.split?.delimiterValue ?? defaults.split.delimiterValue) || defaults.split.delimiterValue;

  const resolved: ResolvedImportCenterMappingTransform = {
    valueHandlingMode: (transform.valueHandlingMode ?? defaults.valueHandlingMode) as ResolvedImportCenterMappingTransform["valueHandlingMode"],
    split: {
      enabled: Boolean(transform.split?.enabled ?? defaults.split.enabled),
      delimiterPreset:
        (transform.split?.delimiterPreset ?? defaults.split.delimiterPreset) as ResolvedImportCenterMappingTransform["split"]["delimiterPreset"],
      delimiterValue: delimiterValue || null,
      trimWhitespace: Boolean(transform.split?.trimWhitespace ?? defaults.split.trimWhitespace),
      ignoreBlankValues: Boolean(transform.split?.ignoreBlankValues ?? defaults.split.ignoreBlankValues)
    },
    relatedRecord: {
      lookupExisting: Boolean(transform.relatedRecord?.lookupExisting ?? defaults.relatedRecord.lookupExisting),
      onMissing:
        (transform.relatedRecord?.onMissing ?? defaults.relatedRecord.onMissing) as ResolvedImportCenterMappingTransform["relatedRecord"]["onMissing"],
      caseInsensitiveMatch: Boolean(
        transform.relatedRecord?.caseInsensitiveMatch ?? defaults.relatedRecord.caseInsensitiveMatch
      ),
      normalizeTrim: Boolean(transform.relatedRecord?.normalizeTrim ?? defaults.relatedRecord.normalizeTrim)
    },
    applyBehavior: (transform.applyBehavior ?? defaults.applyBehavior) as ResolvedImportCenterMappingTransform["applyBehavior"]
  };

  if (targetType === "tags" && !input.mapping?.transform?.split?.delimiterValue && input.fallbackDelimiter) {
    resolved.split.delimiterValue = toText(input.fallbackDelimiter) || resolved.split.delimiterValue;
  }
  if (resolved.valueHandlingMode === "multi_value_split") {
    resolved.split.enabled = true;
  }
  if (resolved.valueHandlingMode === "relation_lookup_or_create") {
    resolved.relatedRecord.lookupExisting = true;
    resolved.relatedRecord.onMissing = "create";
  }
  if (resolved.valueHandlingMode === "relation_lookup") {
    resolved.relatedRecord.lookupExisting = true;
  }
  return resolved;
}

export function tokenizeMappedValue(input: {
  rawValue: unknown;
  transform: ResolvedImportCenterMappingTransform;
  fallbackDelimiter?: string | null;
}) {
  const source = toText(input.rawValue);
  const shouldSplit = input.transform.split.enabled || input.transform.valueHandlingMode === "multi_value_split";
  const delimiter = resolveSplitDelimiter(input.transform.split, input.fallbackDelimiter);
  const values = shouldSplit ? source.split(delimiter) : [source];
  const normalized = values.map((value) =>
    input.transform.split.trimWhitespace ? value.trim() : value
  );
  return input.transform.split.ignoreBlankValues
    ? normalized.filter((value) => value.trim().length > 0)
    : normalized;
}
