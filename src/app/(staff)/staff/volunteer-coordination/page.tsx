import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationDashboard } from "@/components/volunteer-coordination/volunteer-coordination-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerCoordinationPage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Volunteer Coordination"
        subtitle="Operational volunteer recruitment, scheduling, assignments, hours, compliance, and reporting."
      />
      <VolunteerCoordinationDashboard />
    </Card>
  );
}
