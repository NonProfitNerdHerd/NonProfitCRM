import { Card } from "@/components/ui/card";
import { requireImportCenterAccess } from "@/lib/auth/guards";
import { getImportCenterMetadata } from "@/lib/import-center/contact-import-service";
import { ImportCenterLanding } from "@/components/import-center/import-center-landing";

export default async function ImportCenterPage() {
  await requireImportCenterAccess();
  const metadata = await getImportCenterMetadata();

  return (
    <Card>
      <ImportCenterLanding
        initialTemplates={(metadata.templates ?? []) as Array<Record<string, unknown>>}
        initialJobs={(metadata.jobs ?? []) as Array<Record<string, unknown>>}
        schemaWarning={(metadata.schemaWarning ?? null) as string | null}
      />
    </Card>
  );
}
