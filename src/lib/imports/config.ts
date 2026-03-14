export type ImportEntityType =
  | "contact"
  | "organizationContact"
  | "donations"
  | "organizations"
  | "projects"
  | "tasks"
  | "campaigns"
  | "memberships";

export type SourceSystem = "Kindful" | "WebConnex" | "Spreadsheet / Manual" | "Other";

export type FieldClassification = "basic" | "externalKey" | "relationshipKey";

export type ImportField = {
  key: string;
  label: string;
  classification: FieldClassification;
  required?: boolean;
  type?: "text" | "number" | "date" | "email" | "currency" | "boolean";
};

export type ImportRelationshipRule = {
  key: string;
  relatedEntity: ImportEntityType | "contacts" | "campaigns" | "projects" | "organizations";
  relatedField: string;
  relationshipType: "one_to_one" | "many_to_one" | "optional" | "required";
  ifNoMatch: "error" | "skip" | "create_placeholder";
  ifMultipleMatches: "error" | "pick_first" | "hold_for_review";
};

export type ImportEntityConfig = {
  key: ImportEntityType;
  label: string;
  destinationTable: string;
  fields: ImportField[];
  defaultMatchBy: string[];
  relationshipRules: ImportRelationshipRule[];
};

export const IMPORT_ENTITY_CONFIG: Record<ImportEntityType, ImportEntityConfig> = {
  contact: {
    key: "contact",
    label: "Contact",
    destinationTable: "contacts",
    defaultMatchBy: ["external_source_id", "email"],
    relationshipRules: [],
    fields: [
      { key: "first_name", label: "First Name", classification: "basic", required: true, type: "text" },
      { key: "last_name", label: "Last Name", classification: "basic", required: true, type: "text" },
      { key: "preferred_name", label: "Preferred Name", classification: "basic", type: "text" },
      { key: "email", label: "Email", classification: "basic", type: "email" },
      { key: "alternate_email", label: "Alternate Email", classification: "basic", type: "email" },
      { key: "phone", label: "Phone Number", classification: "basic", type: "text" },
      { key: "alternate_phone", label: "Alternate Phone Number", classification: "basic", type: "text" },
      { key: "address_line_1", label: "Physical Address Line 1", classification: "basic", type: "text" },
      { key: "address_line_2", label: "Physical Address Line 2", classification: "basic", type: "text" },
      { key: "city", label: "City", classification: "basic", type: "text" },
      { key: "state", label: "State", classification: "basic", type: "text" },
      { key: "postal_code", label: "Zip", classification: "basic", type: "text" },
      { key: "mailing_address_line_1", label: "Mailing Address Line 1", classification: "basic", type: "text" },
      { key: "mailing_address_line_2", label: "Mailing Address Line 2", classification: "basic", type: "text" },
      { key: "mailing_city", label: "Mailing City", classification: "basic", type: "text" },
      { key: "mailing_state", label: "Mailing State", classification: "basic", type: "text" },
      { key: "mailing_postal_code", label: "Mailing Zip", classification: "basic", type: "text" },
      { key: "external_source_id", label: "External Contact ID", classification: "externalKey", type: "text" }
    ]
  },
  organizationContact: {
    key: "organizationContact",
    label: "Organization Contact",
    destinationTable: "contact_organization_links",
    defaultMatchBy: ["contact_external_source_id", "organization_external_source_id"],
    relationshipRules: [
      {
        key: "contact_external_source_id",
        relatedEntity: "contact",
        relatedField: "external_source_id",
        relationshipType: "many_to_one",
        ifNoMatch: "error",
        ifMultipleMatches: "error"
      },
      {
        key: "organization_external_source_id",
        relatedEntity: "organizations",
        relatedField: "external_source_id",
        relationshipType: "many_to_one",
        ifNoMatch: "error",
        ifMultipleMatches: "error"
      }
    ],
    fields: [
      { key: "contact_external_source_id", label: "Contact External Key", classification: "relationshipKey", required: true, type: "text" },
      { key: "organization_external_source_id", label: "Organization External Key", classification: "relationshipKey", required: true, type: "text" },
      { key: "relationship_type", label: "Relationship Type", classification: "basic", type: "text" }
    ]
  },
  donations: {
    key: "donations",
    label: "Donations",
    destinationTable: "donations",
    defaultMatchBy: ["external_transaction_id"],
    relationshipRules: [
      {
        key: "contact_external_source_id",
        relatedEntity: "contact",
        relatedField: "external_source_id",
        relationshipType: "many_to_one",
        ifNoMatch: "error",
        ifMultipleMatches: "error"
      },
      {
        key: "campaign_external_source_id",
        relatedEntity: "campaigns",
        relatedField: "external_source_id",
        relationshipType: "many_to_one",
        ifNoMatch: "create_placeholder",
        ifMultipleMatches: "error"
      }
    ],
    fields: [
      { key: "contact_external_source_id", label: "Contact External Key", classification: "relationshipKey", required: true, type: "text" },
      { key: "campaign_external_source_id", label: "Campaign External Key", classification: "relationshipKey", type: "text" },
      { key: "campaign_name", label: "Campaign Name", classification: "basic", type: "text" },
      { key: "amount", label: "Amount", classification: "basic", required: true, type: "currency" },
      { key: "currency", label: "Currency", classification: "basic", type: "text" },
      { key: "donation_date", label: "Donation Date", classification: "basic", required: true, type: "date" },
      { key: "payment_type", label: "Payment Method", classification: "basic", type: "text" },
      { key: "check_number", label: "Check Number", classification: "basic", type: "text" },
      { key: "transaction_id", label: "Transaction ID", classification: "basic", type: "text" },
      { key: "memo", label: "Notes", classification: "basic", type: "text" },
      { key: "source_platform", label: "Source System", classification: "basic", type: "text" },
      { key: "external_transaction_id", label: "External Donation ID", classification: "externalKey", type: "text" },
      { key: "is_recurring", label: "Recurring Donation", classification: "basic", type: "boolean" }
    ]
  },
  organizations: {
    key: "organizations",
    label: "Organizations",
    destinationTable: "crm_organizations",
    defaultMatchBy: ["external_source_id", "name"],
    relationshipRules: [],
    fields: [
      { key: "name", label: "Organization Name", classification: "basic", required: true, type: "text" },
      { key: "description", label: "Description", classification: "basic", type: "text" },
      { key: "external_source_id", label: "External Organization ID", classification: "externalKey", type: "text" }
    ]
  },
  projects: {
    key: "projects",
    label: "Projects",
    destinationTable: "projects",
    defaultMatchBy: ["external_source_id", "name"],
    relationshipRules: [],
    fields: [
      { key: "name", label: "Project Name", classification: "basic", required: true, type: "text" },
      { key: "description", label: "Description", classification: "basic", type: "text" },
      { key: "status", label: "Project Status", classification: "basic", type: "text" },
      { key: "project_start_date", label: "Project Start Date", classification: "basic", type: "date" },
      { key: "expected_end_date", label: "Project End Date", classification: "basic", type: "date" },
      { key: "external_source_id", label: "External Project ID", classification: "externalKey", type: "text" }
    ]
  },
  tasks: {
    key: "tasks",
    label: "Tasks",
    destinationTable: "tasks",
    defaultMatchBy: ["external_source_id", "title"],
    relationshipRules: [
      {
        key: "project_external_source_id",
        relatedEntity: "projects",
        relatedField: "external_source_id",
        relationshipType: "many_to_one",
        ifNoMatch: "error",
        ifMultipleMatches: "error"
      }
    ],
    fields: [
      { key: "title", label: "Task Title", classification: "basic", required: true, type: "text" },
      { key: "description", label: "Description", classification: "basic", type: "text" },
      { key: "status", label: "Task Status", classification: "basic", type: "text" },
      { key: "priority", label: "Task Priority", classification: "basic", type: "text" },
      { key: "due_date", label: "Due Date", classification: "basic", type: "date" },
      { key: "project_external_source_id", label: "Project External Key", classification: "relationshipKey", type: "text" },
      { key: "external_source_id", label: "External Task ID", classification: "externalKey", type: "text" }
    ]
  },
  campaigns: {
    key: "campaigns",
    label: "Campaigns",
    destinationTable: "campaigns",
    defaultMatchBy: ["external_source_id", "name"],
    relationshipRules: [],
    fields: [
      { key: "name", label: "Campaign Name", classification: "basic", required: true, type: "text" },
      { key: "description", label: "Description", classification: "basic", type: "text" },
      { key: "status", label: "Campaign Status", classification: "basic", type: "text" },
      { key: "start_date", label: "Start Date", classification: "basic", type: "date" },
      { key: "end_date", label: "End Date", classification: "basic", type: "date" },
      { key: "external_source_id", label: "External Campaign ID", classification: "externalKey", type: "text" }
    ]
  },
  memberships: {
    key: "memberships",
    label: "Memberships",
    destinationTable: "memberships",
    defaultMatchBy: ["external_source_id", "contact_external_source_id"],
    relationshipRules: [
      {
        key: "contact_external_source_id",
        relatedEntity: "contact",
        relatedField: "external_source_id",
        relationshipType: "many_to_one",
        ifNoMatch: "error",
        ifMultipleMatches: "error"
      }
    ],
    fields: [
      { key: "contact_external_source_id", label: "Contact External Key", classification: "relationshipKey", required: true, type: "text" },
      { key: "membership_type", label: "Membership Type Name", classification: "basic", type: "text" },
      { key: "status", label: "Membership Status", classification: "basic", type: "text" },
      { key: "start_date", label: "Start Date", classification: "basic", type: "date" },
      { key: "end_date", label: "End Date", classification: "basic", type: "date" },
      { key: "renewal_date", label: "Renewal Date", classification: "basic", type: "date" },
      { key: "external_source_id", label: "External Membership ID", classification: "externalKey", type: "text" }
    ]
  }
};

export const SOURCE_SYSTEM_OPTIONS: SourceSystem[] = [
  "Kindful",
  "WebConnex",
  "Spreadsheet / Manual",
  "Other"
];

export const IMPORT_MODE_OPTIONS = ["insert", "update", "upsert", "dry_run"] as const;
