import { ContactForm } from "@/components/forms/contact-form";
import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function NewContactPage() {
  await requireStaffPermission("can_create_contacts");

  return (
    <Card className="max-w-3xl">
      <CardHeader
        title="Create contact"
        subtitle="Add a donor/member constituent record"
      />
      <ContactForm />
    </Card>
  );
}
