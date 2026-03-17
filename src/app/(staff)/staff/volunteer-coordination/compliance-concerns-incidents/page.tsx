import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationDashboard } from "@/components/volunteer-coordination/volunteer-coordination-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerCompliancePage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Compliance, Concerns & Incidents"
        subtitle="Review sensitive compliance status, concerns, and incident reporting."
      />
      <VolunteerCoordinationDashboard initialTab="safety" hideInternalTabs />
    </Card>
  );
}
