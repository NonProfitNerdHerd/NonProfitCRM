import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { getTenantDetail } from "@/lib/data/platform-admin";
import { TenantDetailDashboard } from "@/components/platform/tenant-detail-dashboard";

type PageProps = {
  params: Promise<{ tenantId: string }>;
};

export default async function PlatformTenantDetailPage({ params }: PageProps) {
  await requirePlatformAdminAccess();
  const { tenantId } = await params;
  let detail: Awaited<ReturnType<typeof getTenantDetail>> | null = null;
  try {
    detail = await getTenantDetail(tenantId);
  } catch (error) {
    const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
    if (message.includes("no rows") || message.includes("pgrst116")) {
      notFound();
    }
    throw error;
  }
  if (!detail?.tenant) {
    notFound();
  }

  return (
    <Card>
      <CardHeader
        title={`Tenant: ${String(detail.tenant.organization_name ?? detail.tenant.slug ?? tenantId)}`}
        subtitle="Provisioning, backup metadata, restore workflow, and tenant-level operational controls."
      />
      <TenantDetailDashboard
        initialTenant={detail.tenant}
        initialBackupMetadata={detail.backupMetadata}
        initialSnapshots={detail.snapshots}
        initialRestoreHistory={detail.restoreHistory}
        initialProvisioningRuns={detail.provisioningRuns}
        initialEntitlements={detail.entitlements}
        backupTiers={detail.backupTiers}
        initialStats={detail.stats}
      />
    </Card>
  );
}
