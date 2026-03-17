import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationDashboard } from "@/components/volunteer-coordination/volunteer-coordination-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerHoursAttendancePage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Hours Import & Attendance"
        subtitle="Track attendance, staged imports, and finalized volunteer service hours."
      />
      <VolunteerCoordinationDashboard initialTab="hours" hideInternalTabs />
    </Card>
  );
}
