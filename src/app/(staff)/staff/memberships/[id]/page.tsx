import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getMembership } from "@/lib/data/memberships";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MembershipDetailPage({ params }: PageProps) {
  const { id } = await params;
  const membership = await getMembership(id);
  if (!membership) notFound();

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
            {membership.contacts?.first_name} {membership.contacts?.last_name}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Type</p>
          <p>{membership.membership_types?.name ?? "-"}</p>
        </div>
        <div>
          <p className="text-slate-500">Status</p>
          <p>{membership.status}</p>
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
