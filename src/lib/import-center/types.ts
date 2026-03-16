export type ImportCenterType = "contacts" | "transactions";

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

export type ReimportOnMatchBehavior =
  | "skip_existing"
  | "overwrite_existing"
  | "update_blank_only";

export type ReimportOnNoMatchBehavior = "create_new" | "skip_row";

export type ReimportMissingKeyBehavior = "skip_row" | "treat_as_no_match";

export type ReimportMatchSettings = {
  enabled: boolean;
  sourceMatchColumn: string | null;
  destinationMatchField: string | null;
  onMatchBehavior: ReimportOnMatchBehavior;
  onNoMatchBehavior: ReimportOnNoMatchBehavior;
  ignoreBlankOverwrites: true;
  missingKeyBehavior: ReimportMissingKeyBehavior;
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

export type TransactionStandardFieldDefinition = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "date" | "number" | "boolean";
};

export const TRANSACTION_STANDARD_FIELDS: TransactionStandardFieldDefinition[] = [
  { key: "amount", label: "Donation Amount", required: true, type: "number" },
  { key: "donation_date", label: "Donation Date", required: true, type: "date" },
  { key: "payment_type", label: "Payment Type", type: "text" },
  { key: "check_number", label: "Check Number", type: "text" },
  { key: "transaction_id", label: "Transaction ID", type: "text" },
  { key: "memo", label: "Memo", type: "text" },
  { key: "source_platform", label: "Source Platform", type: "text" },
  { key: "external_transaction_id", label: "External Transaction ID", type: "text" },
  { key: "is_recurring", label: "Recurring", type: "boolean" }
];

export const TRANSACTION_CONTACT_CREATE_FIELDS: TransactionStandardFieldDefinition[] = [
  { key: "first_name", label: "Contact First Name", type: "text" },
  { key: "last_name", label: "Contact Last Name", type: "text" },
  { key: "organization_name", label: "Contact Organization Name", type: "text" },
  { key: "email", label: "Contact Email", type: "text" },
  { key: "phone", label: "Contact Phone", type: "text" },
  { key: "external_source_id", label: "Contact External Source ID", type: "text" }
];

export const TRANSACTION_CONTACT_MATCH_FIELDS: Array<{
  key: "email" | "alternate_email" | "phone" | "mobile_number" | "alternate_phone" | "external_source_id";
  label: string;
}> = [
  { key: "email", label: "Primary Email" },
  { key: "alternate_email", label: "Alternate Email" },
  { key: "phone", label: "Primary Phone" },
  { key: "mobile_number", label: "Mobile Number" },
  { key: "alternate_phone", label: "Alternate Phone" },
  { key: "external_source_id", label: "External Source ID" }
];

export type TransactionImportConfig = {
  contactMatchSourceColumn: string | null;
  contactMatchField:
    | "email"
    | "alternate_email"
    | "phone"
    | "mobile_number"
    | "alternate_phone"
    | "external_source_id";
  createMissingContact: boolean;
  newContactType: "person" | "organization";
  newContactCategory: "lead" | "donor" | "non_lead";
  campaignMappingEnabled: boolean;
  campaignSourceColumn: string | null;
  defaultCampaignId: string | null;
  campaignValueMap: Record<string, string>;
};

export type ImportTemplatePayload = {
  importType: ImportCenterType;
  name: string;
  mappings: ImportCenterMapping[];
  classification: Record<string, unknown>;
  tagDelimiter?: string | null;
  duplicateHandling?: "skip" | "flag";
  rerunMatching?: ReimportMatchSettings;
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
  rerunMatching?: ReimportMatchSettings;
};
