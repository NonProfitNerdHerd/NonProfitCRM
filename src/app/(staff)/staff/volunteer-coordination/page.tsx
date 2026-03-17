import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationDashboard } from "@/components/volunteer-coordination/volunteer-coordination-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerCoordinationPage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Volunteer Coordination"
        subtitle="Dashboard overview for volunteer recruitment, staffing health, attendance, and compliance."
      />
      <VolunteerCoordinationDashboard initialTab="overview" hideInternalTabs />
    </Card>
  );
}
