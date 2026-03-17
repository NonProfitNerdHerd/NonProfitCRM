import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationOperationsDashboard } from "@/components/volunteer-coordination/volunteer-coordination-operations-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerCoordinationPage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Volunteer Coordination"
        subtitle="Operational overview for volunteer events, staffing readiness, and top volunteer activity."
      />
      <VolunteerCoordinationOperationsDashboard />
    </Card>
  );
}
