import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationDashboard } from "@/components/volunteer-coordination/volunteer-coordination-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerAssignmentsPage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Assignments, Waitlists & Substitutes"
        subtitle="Assign volunteers to shifts and manage waitlists and substitute coverage."
      />
      <VolunteerCoordinationDashboard initialTab="assignments" hideInternalTabs />
    </Card>
  );
}
