import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationDashboard } from "@/components/volunteer-coordination/volunteer-coordination-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerEventsRolesPage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Events & Roles"
        subtitle="Create volunteer events, recurring schedules, and role staffing requirements."
      />
      <VolunteerCoordinationDashboard initialTab="events" hideInternalTabs />
    </Card>
  );
}
