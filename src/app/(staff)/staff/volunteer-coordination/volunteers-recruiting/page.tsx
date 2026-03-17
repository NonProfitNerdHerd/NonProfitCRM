import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerCoordinationDashboard } from "@/components/volunteer-coordination/volunteer-coordination-dashboard";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerRecruitingPage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Volunteers & Recruiting"
        subtitle="Maintain volunteer profiles, recruiting filters, and candidate readiness."
      />
      <VolunteerCoordinationDashboard initialTab="volunteers" hideInternalTabs />
    </Card>
  );
}
