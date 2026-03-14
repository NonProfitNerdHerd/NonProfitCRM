import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getMembershipTypeWithMembers } from "@/lib/data/memberships";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MembershipTypeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const { type, members } = await getMembershipTypeWithMembers(id);
  if (!type) notFound();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={type.name} subtitle={type.description ?? "Membership type details"} />
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-slate-500">Duration</p>
            <p>
              {(type.membership_length as number) ?? "-"} {type.length_unit as string}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Status</p>
            <p>{(type.status as string) ?? "active"}</p>
          </div>
          <div>
            <p className="text-slate-500">Members</p>
            <p>{members.length}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Members in this group" subtitle="Contact memberships linked to this type" />
        <div className="space-y-2">
          {members.length === 0 ? (
            <p className="text-sm text-slate-500">No members assigned to this type.</p>
          ) : (
            members.map((membership) => {
              const contact = Array.isArray(membership.contacts)
                ? membership.contacts[0]
                : membership.contacts;
              return (
                <Link
                  key={membership.id}
                  href={`/staff/memberships/${membership.id}`}
                  className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-900">
                    {contact?.first_name} {contact?.last_name}
                  </p>
                  <p className="text-xs text-slate-600">
                    Status: {membership.status} • Renewal: {formatDate(membership.renewal_date)}
                  </p>
                </Link>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
