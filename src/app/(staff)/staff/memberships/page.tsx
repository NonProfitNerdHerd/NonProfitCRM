import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { listMembershipsForStaff } from "@/lib/data/memberships";
import { formatDate } from "@/lib/utils";

export default async function MembershipsPage() {
  const memberships = await listMembershipsForStaff();

  return (
    <Card>
      <CardHeader
        title="Memberships"
        subtitle="Status lifecycle, renewal tracking, and history"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Member</th>
              <th className="py-2">Plan</th>
              <th className="py-2">Status</th>
              <th className="py-2">Level</th>
              <th className="py-2">Renewal</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((membership) => {
              const contact = Array.isArray(membership.contacts)
                ? membership.contacts[0]
                : membership.contacts;
              const membershipType = Array.isArray(membership.membership_types)
                ? membership.membership_types[0]
                : membership.membership_types;

              return (
                <tr className="border-b border-slate-100" key={membership.id}>
                  <td className="py-2">
                    <Link href={`/staff/memberships/${membership.id}`}>
                      {contact?.first_name} {contact?.last_name}
                    </Link>
                  </td>
                  <td className="py-2">{membershipType?.name ?? "-"}</td>
                  <td className="py-2">{membership.status}</td>
                  <td className="py-2">{membership.level ?? "-"}</td>
                  <td className="py-2">{formatDate(membership.renewal_date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
