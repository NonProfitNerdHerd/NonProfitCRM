import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { OrganizationSettingsForm } from "@/components/admin/organization-settings-form";

export default async function OrganizationSettingsPage() {
  await requireStaffPermission("can_manage_org_settings");

  return (
    <Card>
      <CardHeader
        title="Organization Settings"
        subtitle="Manage tenant name, primary points of contact, and organization branding."
      />
      <OrganizationSettingsForm />
    </Card>
  );
}
