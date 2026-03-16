export type ImportCenterType = "contacts";

export type ContactClassificationInput = {
  contactType: "person" | "organization";
  contactCategory: "lead" | "donor" | "non_lead";
};

export type ImportCenterMappingTargetType = "standard" | "custom" | "tags" | "unmapped";

export type ImportCenterMapping = {
  sourceHeader: string;
  targetType: ImportCenterMappingTargetType;
  targetKey: string | null;
  createField?: {
    label: string;
    dataType?: "text" | "number" | "date" | "boolean" | "json";
  } | null;
};

export type ContactStandardFieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "email" | "phone" | "date" | "number";
};

export const CONTACT_STANDARD_FIELDS: ContactStandardFieldDefinition[] = [
  { key: "first_name", label: "First Name", required: true },
  { key: "last_name", label: "Last Name", required: true },
  { key: "preferred_name", label: "Preferred Name" },
  { key: "organization_name", label: "Organization Name" },
  { key: "email", label: "Email", type: "email" },
  { key: "alternate_email", label: "Alternate Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "mobile_number", label: "Mobile Number", type: "phone" },
  { key: "alternate_phone", label: "Alternate Phone", type: "phone" },
  { key: "address_line_1", label: "Address Line 1" },
  { key: "address_line_2", label: "Address Line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postal_code", label: "Postal Code" },
  { key: "mailing_address_line_1", label: "Mailing Address Line 1" },
  { key: "mailing_address_line_2", label: "Mailing Address Line 2" },
  { key: "mailing_city", label: "Mailing City" },
  { key: "mailing_state", label: "Mailing State" },
  { key: "mailing_postal_code", label: "Mailing Postal Code" },
  { key: "formal_letter_name", label: "Formal Letter Name" },
  { key: "external_source_id", label: "External Source ID" },
  { key: "tags", label: "Contact Tags" }
];

export type ImportTemplatePayload = {
  importType: ImportCenterType;
  name: string;
  mappings: ImportCenterMapping[];
  classification: ContactClassificationInput;
  tagDelimiter?: string | null;
  duplicateHandling?: "skip" | "flag";
};

export type ContactImportRunInput = {
  importType: ImportCenterType;
  fileName: string;
  rows: Array<Record<string, unknown>>;
  mappings: ImportCenterMapping[];
  classification: ContactClassificationInput;
  templateId?: string | null;
  tagDelimiter?: string | null;
  duplicateHandling?: "skip" | "flag";
};
