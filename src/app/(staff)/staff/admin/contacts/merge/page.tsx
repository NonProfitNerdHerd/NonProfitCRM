import { Card, CardHeader } from "@/components/ui/card";
import { ContactMergeDashboard } from "@/components/admin/contacts/contact-merge-dashboard";
import { getContactMergeHistory, isContactMergeSchemaMissingError } from "@/lib/data/contact-merge";

export default async function ContactMergePage() {
  let initialHistory: Array<Record<string, unknown>> = [];
  let initialWarning: string | null = null;

  try {
    const history = await getContactMergeHistory({ limit: 50, offset: 0 });
    initialHistory = history.items as Array<Record<string, unknown>>;
    initialWarning = history.schemaWarning ?? null;
  } catch (error) {
    initialWarning = isContactMergeSchemaMissingError(error)
      ? "Contact merge schema is not available in this environment yet. Run Supabase migration 202603171300 and retry."
      : error instanceof Error
        ? error.message
        : "Unable to load contact merge dashboard.";
  }

  return (
    <Card>
      <CardHeader
        title="Contact Merge"
        subtitle="Safely merge duplicate contacts with preview, field-level resolution, and audit history."
      />
      <ContactMergeDashboard
        initialHistory={initialHistory as Array<{
          id: string;
          master_contact_id: string;
          duplicate_contact_id: string;
          merged_at: string;
          merge_source: string;
          reassigned_counts: Record<string, unknown>;
        }>}
        initialWarning={initialWarning}
      />
    </Card>
  );
}
