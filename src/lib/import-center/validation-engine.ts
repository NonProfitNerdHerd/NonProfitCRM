import {
  CONTACT_STANDARD_FIELDS,
  type ImportCenterMapping,
  type ContactClassificationInput,
  type ReimportMatchSettings
} from "@/lib/import-center/types";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizePhone(value: unknown) {
  return toText(value).replace(/\D+/g, "");
}

export function isBlankImportValue(value: unknown) {
  if (value === null || value === undefined) return true;
  return toText(value) === "";
}

export function validateContactImportPayload(input: {
  rows: Array<Record<string, unknown>>;
  mappings: ImportCenterMapping[];
  classification: ContactClassificationInput;
}) {
  const errors: string[] = [];
  if (!input.rows.length) errors.push("The uploaded file does not contain any data rows.");

  const mappedHeaders = new Set(input.mappings.map((mapping) => mapping.sourceHeader));
  if (!mappedHeaders.size) errors.push("No headers were detected in the uploaded file.");

  const requiredFieldKeys: string[] =
    input.classification.contactType === "organization"
      ? ["organization_name"]
      : ["first_name", "last_name"];

  const requiredFields = CONTACT_STANDARD_FIELDS.filter((field) => requiredFieldKeys.includes(field.key));
  for (const field of requiredFields) {
    const mapped = input.mappings.find(
      (mapping) => mapping.targetType === "standard" && mapping.targetKey === field.key
    );
    if (!mapped) {
      errors.push(`${field.label} must be mapped before import.`);
    }
  }

  if (!["person", "organization"].includes(input.classification.contactType)) {
    errors.push("Contact Type is required.");
  }
  if (!["lead", "donor", "non_lead"].includes(input.classification.contactCategory)) {
    errors.push("Contact Category is required.");
  }

  return errors;
}

export function validateRerunMatchingConfig(input: {
  rows: Array<Record<string, unknown>>;
  rerunMatching?: ReimportMatchSettings;
  validDestinationFields: string[];
}) {
  const errors: string[] = [];
  const rerun = input.rerunMatching;
  if (!rerun?.enabled) return errors;

  const sourceColumn = toText(rerun.sourceMatchColumn);
  const destinationField = toText(rerun.destinationMatchField);
  if (!sourceColumn) {
    errors.push("Re-Import Matching source key column is required.");
  } else {
    const sourceExists = input.rows.length === 0 || sourceColumn in input.rows[0];
    if (!sourceExists) {
      errors.push(`Re-Import source column "${sourceColumn}" was not found in the uploaded file.`);
    }
  }

  if (!destinationField) {
    errors.push("Re-Import Matching destination CRM field is required.");
  } else if (!input.validDestinationFields.includes(destinationField)) {
    errors.push(`Re-Import destination field "${destinationField}" is not valid.`);
  }

  return errors;
}

export function buildRerunMatchingWarnings(input: {
  rows: Array<Record<string, unknown>>;
  rerunMatching?: ReimportMatchSettings;
}) {
  const rerun = input.rerunMatching;
  if (!rerun?.enabled || !toText(rerun.sourceMatchColumn)) {
    return {
      blankKeyCount: 0,
      duplicateKeyCount: 0
    };
  }

  const sourceColumn = toText(rerun.sourceMatchColumn);
  const seen = new Set<string>();
  let blankKeyCount = 0;
  let duplicateKeyCount = 0;
  for (const row of input.rows) {
    const value = toText(row[sourceColumn]);
    if (!value) {
      blankKeyCount += 1;
      continue;
    }
    const normalized = value.toLowerCase();
    if (seen.has(normalized)) duplicateKeyCount += 1;
    else seen.add(normalized);
  }
  return { blankKeyCount, duplicateKeyCount };
}

export function detectInFileDuplicateWarnings(input: {
  rows: Array<Record<string, unknown>>;
  mappings: ImportCenterMapping[];
}) {
  const emailMapping = input.mappings.find(
    (mapping) => mapping.targetType === "standard" && mapping.targetKey === "email"
  );
  const firstNameMapping = input.mappings.find(
    (mapping) => mapping.targetType === "standard" && mapping.targetKey === "first_name"
  );
  const lastNameMapping = input.mappings.find(
    (mapping) => mapping.targetType === "standard" && mapping.targetKey === "last_name"
  );
  const phoneMapping = input.mappings.find(
    (mapping) => mapping.targetType === "standard" && mapping.targetKey === "phone"
  );

  const seenEmail = new Set<string>();
  const seenNamePhone = new Set<string>();
  let emailDuplicates = 0;
  let namePhoneDuplicates = 0;

  for (const row of input.rows) {
    if (emailMapping) {
      const email = toText(row[emailMapping.sourceHeader]).toLowerCase();
      if (email) {
        if (seenEmail.has(email)) emailDuplicates += 1;
        else seenEmail.add(email);
      }
    }

    if (firstNameMapping && lastNameMapping && phoneMapping) {
      const key = [
        toText(row[firstNameMapping.sourceHeader]).toLowerCase(),
        toText(row[lastNameMapping.sourceHeader]).toLowerCase(),
        normalizePhone(row[phoneMapping.sourceHeader])
      ]
        .filter(Boolean)
        .join("|");
      if (key) {
        if (seenNamePhone.has(key)) namePhoneDuplicates += 1;
        else seenNamePhone.add(key);
      }
    }
  }

  return { emailDuplicates, namePhoneDuplicates };
}
