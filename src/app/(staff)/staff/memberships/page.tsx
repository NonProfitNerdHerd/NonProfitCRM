import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { listMembershipsForStaff, listMembershipTypes } from "@/lib/data/memberships";
import { MembershipTypeForm } from "@/components/forms/membership-type-form";
import { MembershipsTable } from "@/components/memberships/memberships-table";

export default async function MembershipsPage() {
  const [memberships, membershipTypes] = await Promise.all([
    listMembershipsForStaff(),
    listMembershipTypes()
  ]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Membership Types"
          subtitle="Define membership duration and status for each group"
        />
        <MembershipTypeForm />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Type</th>
                <th className="py-2">Duration</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {membershipTypes.map((type) => (
                <tr key={type.id} className="border-b border-slate-100">
                  <td className="py-2">
                    <Link href={`/staff/memberships/types/${type.id}`}>{type.name}</Link>
                  </td>
                  <td className="py-2">
                    {(type.membership_length as number) ?? "-"} {type.length_unit as string}
                  </td>
                  <td className="py-2">{(type.status as string) ?? "active"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Contact Memberships"
          subtitle="Status lifecycle, renewal tracking, history, and active/inactive controls"
        />
        <MembershipsTable initialMemberships={memberships as Array<Record<string, unknown>>} />
      </Card>
    </div>
  );
}
