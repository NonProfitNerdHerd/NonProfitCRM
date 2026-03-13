import { Card, CardHeader } from "@/components/ui/card";
import { PortalProfileForm } from "@/components/forms/portal-profile-form";
import { getPortalContact } from "@/lib/data/portal";

export default async function PortalProfilePage() {
  const contact = await getPortalContact();

  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="My Profile"
        subtitle="Update approved contact details and communication preferences"
      />
      <PortalProfileForm
        initialValues={{
          preferred_name: contact.preferred_name,
          email: contact.email,
          phone: contact.phone,
          communication_preferences: contact.communication_preferences as Record<
            string,
            unknown
          >
        }}
      />
    </Card>
  );
}
