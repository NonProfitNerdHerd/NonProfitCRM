import { Card, CardHeader } from "@/components/ui/card";
import { VolunteerEventBuilder } from "@/components/volunteer-coordination/volunteer-event-builder";
import { requireVolunteerCoordinationAccess } from "@/lib/auth/guards";

export default async function VolunteerEventsRolesPage() {
  await requireVolunteerCoordinationAccess();

  return (
    <Card>
      <CardHeader
        title="Events & Roles"
        subtitle="Guided event builder for event setup, recurrence, roles, shifts, staffing, and fallback planning."
      />
      <VolunteerEventBuilder />
    </Card>
  );
}
