import { Card, CardHeader } from "@/components/ui/card";
import { listPortalMemberships } from "@/lib/data/memberships";
import { formatDate } from "@/lib/utils";

export default async function PortalMembershipPage() {
  const memberships = await listPortalMemberships();

  return (
    <Card>
      <CardHeader
        title="My Membership"
        subtitle="Status and renewal information for your memberships"
      />
      <div className="space-y-3">
        {memberships.length === 0 ? (
          <p className="text-sm text-slate-500">No membership records available.</p>
        ) : (
          memberships.map((membership) => {
            const membershipType = Array.isArray(membership.membership_types)
              ? membership.membership_types[0]
              : membership.membership_types;

            return (
              <article key={membership.id} className="rounded-md border border-slate-200 p-3">
                <p className="font-medium text-slate-900">
                  {membershipType?.name ?? "Membership"}
                </p>
                <p className="text-sm text-slate-700">
                  {membership.status} • Level {membership.level ?? "-"}
                </p>
                <p className="text-xs text-slate-500">
                  Renewal: {formatDate(membership.renewal_date)}
                </p>
              </article>
            );
          })
        )}
      </div>
    </Card>
  );
}
