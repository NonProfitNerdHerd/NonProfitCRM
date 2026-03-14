import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getMembership } from "@/lib/data/memberships";
import { formatDate } from "@/lib/utils";
import { MembershipStatusToggle } from "@/components/memberships/membership-status-toggle";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MembershipDetailPage({ params }: PageProps) {
  const { id } = await params;
  const membership = await getMembership(id);
  if (!membership) notFound();
  const contact = Array.isArray(membership.contacts)
    ? membership.contacts[0]
    : membership.contacts;
  const membershipType = Array.isArray(membership.membership_types)
    ? membership.membership_types[0]
    : membership.membership_types;

  return (
    <Card>
      <CardHeader
        title="Membership detail"
        subtitle="Upgrade, downgrade, renewal, and historical status foundation"
      />
      <div className="grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="text-slate-500">Member</p>
          <p>
            {contact?.first_name} {contact?.last_name}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Type</p>
          <p>{membershipType?.name ?? "-"}</p>
        </div>
        <div>
          <p className="text-slate-500">Status</p>
          <MembershipStatusToggle
            membershipId={membership.id as string}
            initialStatus={membership.status as string}
          />
        </div>
        <div>
          <p className="text-slate-500">Level</p>
          <p>{membership.level ?? "-"}</p>
        </div>
        <div>
          <p className="text-slate-500">Start</p>
          <p>{formatDate(membership.start_date)}</p>
        </div>
        <div>
          <p className="text-slate-500">Renewal</p>
          <p>{formatDate(membership.renewal_date)}</p>
        </div>
      </div>
    </Card>
  );
}
