import { Card, CardHeader } from "@/components/ui/card";
import { requirePlatformAdminAccess } from "@/lib/auth/guards";
import { listRestoreRequests } from "@/lib/data/platform-admin";
import { RestoreRequestsDashboard } from "@/components/platform/restore-requests-dashboard";

export default async function PlatformRestoreRequestsPage() {
  await requirePlatformAdminAccess();
  const requests = await listRestoreRequests();

  return (
    <Card>
      <CardHeader
        title="Tenant Restore Requests"
        subtitle="Track restore requests, risk flags, target environments, and execution status."
      />
      <RestoreRequestsDashboard initialRequests={requests} />
    </Card>
  );
}
