import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { getIntegrationDetailForAdmin } from "@/lib/data/integrations";
import { WebconnexIntegrationDetail } from "@/components/admin/integrations/webconnex-integration-detail";

type RouteProps = {
  params: Promise<{ integrationKey: string }>;
  searchParams?: Promise<{ tab?: string }>;
};

function resolveTab(tab: string | undefined) {
  if (!tab) return "overview";
  if (
    tab === "overview" ||
    tab === "configuration" ||
    tab === "sync" ||
    tab === "mapping" ||
    tab === "history" ||
    tab === "errors"
  ) {
    return tab;
  }
  return "overview";
}

export default async function IntegrationDetailPage({ params, searchParams }: RouteProps) {
  const { integrationKey } = await params;
  const query = searchParams ? await searchParams : {};
  const detail = await getIntegrationDetailForAdmin(integrationKey);

  return (
    <Card>
      <div className="mb-2">
        <Link href="/staff/admin/integrations">
          <Button type="button" variant="ghost">
            Back to Integrations
          </Button>
        </Link>
      </div>
      <CardHeader
        title={`${String(detail.definition.name ?? integrationKey)} Integration`}
        subtitle="Connection configuration, sync settings, history, and error queue"
      />
      <WebconnexIntegrationDetail
        integrationKey={integrationKey}
        initialData={detail as unknown as {
          definition: Record<string, unknown>;
          connection: Record<string, unknown>;
          jobs: Array<Record<string, unknown>>;
          errors: Array<Record<string, unknown>>;
          overview: Record<string, unknown>;
        }}
        initialTab={resolveTab(query.tab)}
      />
    </Card>
  );
}
