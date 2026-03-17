import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import Link from "next/link";

export default async function ContactsMailBuilderPage() {
  await requireStaffPermission("can_view_contacts");

  return (
    <Card>
      <CardHeader
        title="Mail Builder"
        subtitle="Select a mail workflow to start. More mail build types can be added over time."
      />
      <div className="space-y-3">
        <div className="rounded-md border border-slate-200 p-4">
          <h3 className="text-base font-semibold text-slate-900">Available Mail Builds</h3>
          <p className="text-sm text-slate-600">
            Start a configured mail process. Each workflow can maintain its own templates and defaults.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href="/staff/contacts/mail-builder/donation-thank-you-mailer"
            className="rounded-md border border-slate-200 bg-white p-4 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <p className="text-sm font-semibold text-slate-900">Donation Thank You Mailer</p>
            <p className="mt-1 text-xs text-slate-600">
              Build thank-you letters, labels, and envelopes for donor acknowledgements.
            </p>
          </Link>

          <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-500">More mail builds coming soon</p>
            <p className="mt-1 text-xs text-slate-500">
              Example: event invitations, pledge reminders, and membership renewals.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
