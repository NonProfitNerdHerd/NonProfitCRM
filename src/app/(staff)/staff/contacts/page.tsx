import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { listContacts } from "@/lib/data/contacts";

export default async function ContactsPage() {
  const contacts = await listContacts();

  return (
    <Card>
      <CardHeader
        title="Contacts"
        subtitle="Donor and member records across the organization"
      />
      <div className="mb-4">
        <Link
          className="inline-flex rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
          href="/staff/contacts/new"
        >
          New contact
        </Link>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-600">
              <th className="py-2">Name</th>
              <th className="py-2">Email</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Donor Status</th>
              <th className="py-2">Member Status</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr className="border-b border-slate-100" key={contact.id}>
                <td className="py-2">
                  <Link href={`/staff/contacts/${contact.id}`}>
                    {contact.first_name} {contact.last_name}
                  </Link>
                </td>
                <td className="py-2">{contact.email ?? "-"}</td>
                <td className="py-2">{contact.phone ?? "-"}</td>
                <td className="py-2">{contact.donor_status}</td>
                <td className="py-2">{contact.member_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
