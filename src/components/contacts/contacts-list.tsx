import Link from "next/link";

export function ContactsList({
  title,
  subtitle,
  contacts
}: {
  title: string;
  subtitle: string;
  contacts: Array<Record<string, unknown>>;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">{subtitle}</p>
        </div>
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
              <th className="py-2">Organization</th>
              <th className="py-2">Email</th>
              <th className="py-2">Phone</th>
              <th className="py-2">Donor Status</th>
              <th className="py-2">Member Status</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => (
              <tr className="border-b border-slate-100" key={contact.id as string}>
                <td className="py-2">
                  <Link href={`/staff/contacts/${contact.id as string}`}>
                    {(contact.first_name as string) ?? ""} {(contact.last_name as string) ?? ""}
                  </Link>
                </td>
                <td className="py-2">{(contact.organization_name as string) ?? "-"}</td>
                <td className="py-2">{(contact.email as string) ?? "-"}</td>
                <td className="py-2">{(contact.phone as string) ?? "-"}</td>
                <td className="py-2">{(contact.donor_status as string) ?? "-"}</td>
                <td className="py-2">{(contact.member_status as string) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {contacts.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No contacts found for this segment.</p>
      ) : null}
    </div>
  );
}
