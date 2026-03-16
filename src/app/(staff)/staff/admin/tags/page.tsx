import { Card, CardHeader } from "@/components/ui/card";
import { requireAnyStaffPermission } from "@/lib/auth/guards";
import { listTagDefinitions } from "@/lib/data/tags";
import { TagsDashboard } from "@/components/admin/tags/tags-dashboard";

export default async function TagsAdminPage() {
  await requireAnyStaffPermission(["can_assign_contact_tags", "can_manage_contact_tags"]);
  const initial = await listTagDefinitions({ active: "active" });

  return (
    <Card>
      <CardHeader
        title="Contact Tags"
        subtitle="Manage taxonomy hierarchy, bulk tag jobs, and integration mappings"
      />
      <TagsDashboard initialTree={initial.tree} initialTags={initial.tags} />
    </Card>
  );
}

