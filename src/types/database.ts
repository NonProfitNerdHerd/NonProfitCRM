export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VisibilityClassification =
  | "staff_public"
  | "staff_restricted"
  | "pii_protected"
  | "portal_visible"
  | "internal_only";

export type PermissionKey =
  | "can_view_contacts"
  | "can_create_contacts"
  | "can_edit_contacts"
  | "can_delete_contacts"
  | "can_view_pii"
  | "can_view_sensitive_notes"
  | "can_view_sensitive_tasks"
  | "can_create_notes"
  | "can_edit_notes"
  | "can_delete_notes"
  | "can_create_tasks"
  | "can_edit_tasks"
  | "can_delete_tasks"
  | "can_view_donations"
  | "can_create_donations"
  | "can_edit_donations"
  | "can_manage_memberships"
  | "can_view_communications"
  | "can_manage_communications"
  | "can_manage_imports"
  | "can_run_reports"
  | "can_build_reports"
  | "can_export_csv"
  | "can_export_excel"
  | "can_manage_users"
  | "can_manage_integrations"
  | "can_manage_org_settings"
  | "can_view_audit_log"
  | "can_view_dashboard"
  | "can_view_financial_summaries"
  | "can_view_member_records"
  | "can_manage_role_templates"
  | "can_create_projects"
  | "can_create_campaigns";

export type Database = {
  public: {
    Tables: Record<
      string,
      {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: never[];
      }
    >;
    Views: Record<
      string,
      {
        Row: Record<string, unknown>;
      }
    >;
    Functions: Record<
      string,
      {
        Args: Record<string, unknown>;
        Returns: unknown;
      }
    >;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, never>;
  };
};
