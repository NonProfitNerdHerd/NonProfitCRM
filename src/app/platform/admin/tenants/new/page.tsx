import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { listBackupTiers } from "@/lib/data/platform-admin";
import { TenantQuickCreate } from "@/components/platform/tenant-quick-create";

export default async function PlatformTenantQuickCreatePage() {
  await requirePlatformAdminAccess();
  const backupTiers = await listBackupTiers();

  return (
    <Card>
      <CardHeader
        title="Create New Tenant"
        subtitle="Provision a tenant and then open the tenant detail or tenant console."
      />
      <TenantQuickCreate backupTiers={backupTiers} />
    </Card>
  );
}
