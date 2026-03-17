import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationDashboard } from "@/components/volunteer-coordination/volunteer-coordination-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerFamiliesGroupsPage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Families & Groups"
        subtitle="Coordinate family participation and group volunteer rosters."
      />
      <VolunteerCoordinationDashboard initialTab="families-groups" hideInternalTabs />
    </Card>
  );
}
