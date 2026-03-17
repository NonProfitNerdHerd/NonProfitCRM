import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { TenantQuickCreate } from "@/components/platform/tenant-quick-create";

export default async function PlatformTenantQuickCreatePage() {
  await requirePlatformAdminAccess();

  return (
    <Card>
      <CardHeader
        title="Create New Tenant"
        subtitle="Quick-create a tenant with basic contact information and get the new tenant path."
      />
      <TenantQuickCreate />
    </Card>
  );
}
