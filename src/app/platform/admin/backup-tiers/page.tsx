import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformRoleKeys } from "@/lib/auth/guards";
import { listBackupTiers } from "@/lib/data/platform-admin";
import { BackupTierDashboard } from "@/components/platform/backup-tier-dashboard";

export default async function PlatformBackupTiersPage() {
  await requirePlatformRoleKeys(["super_admin", "build_team_admin", "billing_admin"]);
  const tiers = await listBackupTiers();

  return (
    <Card>
      <CardHeader
        title="Backup Tier Configuration"
        subtitle="Configure backup frequency, retention, and restore capabilities by tier."
      />
      <BackupTierDashboard initialTiers={tiers} />
    </Card>
  );
}
