import { Card, CardHeader } from "@/components/ui/card";

export default async function PortalSettingsPage() {
  return (
    <Card>
      <CardHeader
        title="Account Settings"
        subtitle="Communication preferences and self-service controls"
      />
      <p className="text-sm text-slate-700">
        Additional controls such as password reset, MFA enrollment, and document
        preferences can be added here in future iterations.
      </p>
    </Card>
  );
}
