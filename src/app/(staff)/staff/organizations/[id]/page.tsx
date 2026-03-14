import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { getCrmOrganization } from "@/lib/data/crm-organizations";
import { requireStaffPermission } from "@/lib/auth/guards";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrganizationDetailPage({ params }: PageProps) {
  await requireStaffPermission("can_view_contacts");
  const { id } = await params;
  const { organization, contacts } = await getCrmOrganization(id);
  if (!organization) notFound();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={organization.name} subtitle={organization.description ?? "No description"} />
      </Card>
      <Card>
        <CardHeader
          title="Related Contacts"
          subtitle="Contacts linked to this organization relationship"
        />
        <div className="space-y-2">
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-500">No related contacts.</p>
          ) : (
            contacts.map((link) => {
              const contact = Array.isArray(link.contacts) ? link.contacts[0] : link.contacts;
              return (
                <Link
                  key={link.id}
                  href={`/staff/contacts/${contact?.id as string}`}
                  className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
                >
                  <p className="text-sm font-medium text-slate-900">
                    {contact?.first_name} {contact?.last_name}
                  </p>
                  <p className="text-xs text-slate-500">{contact?.email ?? "-"}</p>
                </Link>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}
