import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { listBackupTiers, listTenants } from "@/lib/data/platform-admin";
import { TenantRegistryDashboard } from "@/components/platform/tenant-registry-dashboard";

export default async function PlatformTenantRegistryPage() {
  await requirePlatformAdminAccess();
  const [tenants, backupTiers] = await Promise.all([listTenants(), listBackupTiers()]);

  return (
    <Card>
      <CardHeader
        title="Tenant Registry"
        subtitle="Search, filter, provision, and open tenant detail records."
      />
      <TenantRegistryDashboard initialTenants={tenants} backupTiers={backupTiers} />
    </Card>
  );
}
