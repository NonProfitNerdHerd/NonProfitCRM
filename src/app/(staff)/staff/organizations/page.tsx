import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { listCrmOrganizations } from "@/lib/data/crm-organizations";
import { requireStaffPermission } from "@/lib/auth/guards";
import { CrmOrganizationForm } from "@/components/forms/crm-organization-form";

export default async function OrganizationsPage() {
  await requireStaffPermission("can_view_contacts");
  const organizations = await listCrmOrganizations();

  return (
    <Card>
      <CardHeader
        title="Organizations"
        subtitle="Manage organizations related to contacts and project work"
      />
      <div className="mb-4">
        <CrmOrganizationForm />
      </div>
      <div className="space-y-2">
        {organizations.length === 0 ? (
          <p className="text-sm text-slate-500">No organizations yet.</p>
        ) : (
          organizations.map((organization) => (
            <Link
              key={organization.id}
              href={`/staff/organizations/${organization.id}`}
              className="block rounded-md border border-slate-200 px-4 py-3 hover:bg-slate-50"
            >
              <p className="text-sm font-semibold text-slate-900">{organization.name}</p>
              <p className="text-xs text-slate-600">{organization.description ?? "-"}</p>
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}
