import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getContact } from "@/lib/data/contacts";
import { listContactNotes } from "@/lib/data/activity";
import { formatDate } from "@/lib/utils";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContactDetailPage({ params }: PageProps) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  const notes = await listContactNotes(id);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={`${contact.first_name} ${contact.last_name}`}
          subtitle="Contact detail profile"
        />
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            <p className="text-slate-500">Email</p>
            <p>{contact.email ?? "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Phone</p>
            <p>{contact.phone ?? "-"}</p>
          </div>
          <div>
            <p className="text-slate-500">Birthdate</p>
            <p>{formatDate(contact.birthdate)}</p>
          </div>
          <div>
            <p className="text-slate-500">Donor Status</p>
            <p>{contact.donor_status}</p>
          </div>
          <div>
            <p className="text-slate-500">Member Status</p>
            <p>{contact.member_status}</p>
          </div>
          <div>
            <p className="text-slate-500">Tags</p>
            <p>{(contact.tags ?? []).join(", ") || "-"}</p>
          </div>
        </div>
      </Card>
      <Card>
        <CardHeader title="Notes & Activity" subtitle="Visibility-classified notes" />
        <div className="space-y-3">
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">No notes recorded.</p>
          ) : (
            notes.map((note) => (
              <article key={note.id} className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span>{note.note_type}</span>
                  <span>{note.visibility_classification}</span>
                </div>
                <p className="text-sm text-slate-800">{note.body}</p>
              </article>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
