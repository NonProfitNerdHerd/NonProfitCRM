import { Card, CardHeader } from "@/components/ui/card";
import { requireAnyStaffPermission, requireRoleKeys } from "@/lib/auth/guards";
import { listTagDefinitions } from "@/lib/data/tags";
import { TagsDashboard, type TagsDashboardNode } from "@/components/admin/tags/tags-dashboard";

export default async function BulkTagContactsPage() {
  await requireRoleKeys(["administrator", "data_steward"]);
  await requireAnyStaffPermission(["can_assign_contact_tags", "can_manage_contact_tags"]);

  let initial: {
    tags: Array<Record<string, unknown>>;
    tree: Array<Record<string, unknown>>;
    schemaWarning?: string | null;
  } = {
    tags: [],
    tree: [],
    schemaWarning: null
  };
  let loadError: string | null = null;
  try {
    initial = await listTagDefinitions({ active: "active" });
  } catch (error) {
    loadError = error instanceof Error ? error.message : "Unable to load tags in this environment.";
  }

  return (
    <Card>
      <CardHeader
        title="Bulk Tag Contacts"
        subtitle="Run add/remove tag jobs against filtered contact segments."
      />
      <TagsDashboard
        initialTree={initial.tree as TagsDashboardNode[]}
        initialTags={initial.tags as TagsDashboardNode[]}
        initialWarning={initial.schemaWarning ?? loadError}
        initialTab="bulk"
        hideTabSelector
      />
    </Card>
  );
}
