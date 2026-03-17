import { Card, CardHeader } from "@/components/ui/card";
import { MailBuilderWizard } from "@/components/contacts/mail-builder-wizard";
import { requireStaffPermission } from "@/lib/auth/guards";

export default async function DonationThankYouMailerPage() {
  await requireStaffPermission("can_view_contacts");

  return (
    <Card>
      <CardHeader
        title="Donation Thank You Mailer"
        subtitle="Create donor thank-you letters and matching labels or envelopes."
      />
      <MailBuilderWizard />
    </Card>
  );
}
