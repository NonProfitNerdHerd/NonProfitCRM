import { notFound } from "next/navigation";
import { Card, CardHeader } from "@/components/ui/card";
import { getContactProfileData } from "@/lib/data/contact-profile";
import { ContactProfileTabs } from "@/components/contacts/contact-profile-tabs";
import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContactDetailPage({ params }: PageProps) {
  const { id } = await params;
  const context = await requireStaffPermission("can_view_contacts");
  const profile = await getContactProfileData(id);
  const contact = profile.contact;
  if (!contact) notFound();

  const supabase = await createClient();
  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true);

  const staffUserIds = (memberships ?? []).map((membership) => membership.user_id);
  const { data: profiles } = staffUserIds.length
    ? await supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", staffUserIds)
    : { data: [] as Array<{ id: string; display_name: string | null }> };
  const profileMap = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={
            String(contact.entity_type ?? "person") === "organization"
              ? String(contact.organization_name || "Organization")
              : `${contact.first_name} ${contact.last_name}${contact.preferred_name ? ` (${contact.preferred_name})` : ""}`
          }
          subtitle="Contact profile"
        />
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <p className="text-slate-500">Email(s)</p>
            <div className="space-y-1">
              {(profile.emails.length ? profile.emails : [{ email: contact.email, label: "primary" }]).map(
                (entry) => (
                  <p key={`${entry.email}-${entry.label}`}>
                    {entry.email ?? "-"}{" "}
                    <span className="text-xs text-slate-500">({entry.label ?? "primary"})</span>
                  </p>
                )
              )}
            </div>
          </div>
          <div>
            <p className="text-slate-500">Phone(s)</p>
            <div className="space-y-1">
              {(profile.phones.length ? profile.phones : [{ phone: contact.phone, label: "primary" }]).map(
                (entry) => (
                  <p key={`${entry.phone}-${entry.label}`}>
                    {entry.phone ?? "-"}{" "}
                    <span className="text-xs text-slate-500">({entry.label ?? "primary"})</span>
                  </p>
                )
              )}
            </div>
          </div>
          {profile.customFields.length > 0 ? (
            <div className="md:col-span-2">
              <p className="text-slate-500">Custom Fields</p>
              <div className="mt-1 grid gap-1 md:grid-cols-2">
                {profile.customFields.map((entry) => (
                  <p key={`${String(entry.internalKey)}-${String(entry.label)}`}>
                    <span className="font-medium text-slate-700">{String(entry.label)}:</span>{" "}
                    <span className="text-slate-900">{String(entry.value || "-")}</span>
                  </p>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Contact Workbench"
          subtitle="Activity, donations, notes, follow-up tasks, and relationship workflows"
        />
        <ContactProfileTabs
          contactId={String(contact.id)}
          contactDetails={contact as Record<string, unknown>}
          taskUrgency={profile.taskUrgency}
          activity={profile.activity}
          donations={profile.donations}
          notes={profile.notes}
          tasks={profile.tasks}
          memberships={profile.memberships}
          campaigns={profile.campaigns}
          staffUsers={(memberships ?? []).map((membership) => ({
            user_id: membership.user_id as string,
            display_name: profileMap.get(membership.user_id as string) ?? null
          }))}
        />
      </Card>
    </div>
  );
}
