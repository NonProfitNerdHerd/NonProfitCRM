import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { CallSheetBuilder } from "@/components/tasks/call-sheet-builder";

export default async function TaskCallSheetPage() {
  await requireStaffPermission("can_view_dashboard");
  return (
    <Card>
      <CardHeader
        title="Call Sheet"
        subtitle="Build and print your call list from tasks that require calling contacts."
      />
      <CallSheetBuilder />
    </Card>
  );
}
