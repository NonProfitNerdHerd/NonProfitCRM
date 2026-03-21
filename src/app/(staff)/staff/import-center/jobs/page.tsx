import { Card } from "@/components/ui/card";
import { requireImportCenterAccess } from "@/lib/auth/guards";
import { listImportJobs } from "@/lib/import-center/import-jobs-service";
import { ImportJobsDashboard } from "@/components/import-center/import-jobs-dashboard";

export default async function ImportJobsPage() {
  await requireImportCenterAccess();
  const initial = await listImportJobs({ limit: 25, offset: 0 });

  return (
    <Card>
      <ImportJobsDashboard
        initialJobs={(initial.jobs ?? []) as Array<Record<string, unknown>>}
        initialTotal={Number(initial.total ?? 0)}
        initialLimit={Number(initial.limit ?? 25)}
        initialOffset={Number(initial.offset ?? 0)}
      />
    </Card>
  );
}
