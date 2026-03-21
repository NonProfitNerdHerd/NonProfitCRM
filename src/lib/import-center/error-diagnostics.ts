type Diagnostic = {
  category: string;
  likelyCause: string;
  suggestedFix: string;
};

function toText(value: unknown) {
  return String(value ?? "").trim();
}

export function formatImportErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = toText(error.message);
    if (message) return message;
    return fallback;
  }
  if (typeof error === "string") {
    return toText(error) || fallback;
  }
  if (error && typeof error === "object") {
    const value = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
      error?: unknown;
    };
    const parts = [
      toText(value.message),
      toText(value.details),
      toText(value.hint),
      toText(value.code)
    ].filter(Boolean);
    if (parts.length > 0) {
      return parts.join(" | ");
    }
    const nested = toText(value.error);
    if (nested) return nested;
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

export function classifyImportError(errorMessage: string): Diagnostic {
  const message = toText(errorMessage);
  const lower = message.toLowerCase();

  if (lower.includes("required")) {
    return {
      category: "Missing required value",
      likelyCause: "One or more required mapped fields are blank on this row.",
      suggestedFix: "Populate required fields in the source file or adjust mapping requirements."
    };
  }
  if (lower.includes("duplicate")) {
    return {
      category: "Duplicate detected",
      likelyCause: "Row matched an existing record or duplicate transaction rule.",
      suggestedFix: "Review dedupe rules and remove/adjust duplicate rows before retry."
    };
  }
  if (lower.includes("ambiguous")) {
    return {
      category: "Ambiguous match",
      likelyCause: "Matching key resolved to multiple existing CRM records.",
      suggestedFix: "Use a more unique key column or clean duplicate records in CRM."
    };
  }
  if (lower.includes("not found") || lower.includes("no contact was found")) {
    return {
      category: "Related record missing",
      likelyCause: "Referenced contact/tag/campaign was not found using configured matching rules.",
      suggestedFix: "Correct source values, update relation mapping settings, or enable create-on-missing."
    };
  }
  if (
    lower.includes("could not be parsed") ||
    lower.includes("invalid input syntax") ||
    lower.includes("must be a positive number")
  ) {
    return {
      category: "Invalid value format",
      likelyCause: "Source value format does not match destination field expectations.",
      suggestedFix: "Normalize date/number/text format in source file and retry."
    };
  }
  if (lower.includes("permission") || lower.includes("row-level security")) {
    return {
      category: "Permission or policy block",
      likelyCause: "Import processor could not write due to permission/RLS restrictions.",
      suggestedFix: "Verify import role permissions and tenant scoping policies."
    };
  }
  if (lower.includes("constraint") || lower.includes("violates")) {
    return {
      category: "Database constraint violation",
      likelyCause: "Row data conflicts with uniqueness or relational constraints.",
      suggestedFix: "Inspect conflicting fields and resolve duplicates/invalid references."
    };
  }

  return {
    category: "Processing error",
    likelyCause: "Unexpected import processing failure.",
    suggestedFix: "Review error message and raw row data, then correct values or mapping settings."
  };
}
