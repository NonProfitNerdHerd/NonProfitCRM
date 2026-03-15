import { Card, CardHeader } from "@/components/ui/card";
import { requireStaffPermission } from "@/lib/auth/guards";
import { listContacts } from "@/lib/data/contacts";
import { ContactsList } from "@/components/contacts/contacts-list";
import { createClient } from "@/lib/supabase/server";

function deriveLegacyTrackingStatus(row: Record<string, unknown>) {
  const donorStatus = String(row.donor_status ?? "").toLowerCase();
  const externalSource = String(row.external_source ?? "").toLowerCase();
  const externalSourceId = String(row.external_source_id ?? "").trim();
  const hasWebconnexLink =
    externalSourceId.length > 0 &&
    (externalSource === "webconnex" || externalSource === "givingfuel");
  if (hasWebconnexLink) return "donor";
  if (donorStatus === "active" || donorStatus === "lapsed") return "donor";
  if (donorStatus === "inactive") return "non_lead";
  return "lead";
}

export default async function ContactsPage() {
  const context = await requireStaffPermission("can_view_contacts");
  const supabase = await createClient();
  const contacts = await listContacts("all");
  let donorCount = 0;
  let leadCount = 0;
  let nonLeadCount = 0;

  const [donorResult, leadResult, nonLeadResult] = await Promise.all([
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("tracking_status", "donor"),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("tracking_status", "lead"),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("tracking_status", "non_lead")
  ]);

  if (!donorResult.error && !leadResult.error && !nonLeadResult.error) {
    donorCount = donorResult.count ?? 0;
    leadCount = leadResult.count ?? 0;
    nonLeadCount = nonLeadResult.count ?? 0;
  } else {
    const fallbackRowsResult = await supabase
      .from("contacts")
      .select("tracking_status, donor_status, external_source, external_source_id")
      .eq("organization_id", context.organizationId)
      .limit(50000);
    if (!fallbackRowsResult.error) {
      for (const row of fallbackRowsResult.data ?? []) {
        const status =
          String(row.tracking_status ?? "").toLowerCase() ||
          deriveLegacyTrackingStatus(row as Record<string, unknown>);
        if (status === "donor") donorCount += 1;
        else if (status === "non_lead") nonLeadCount += 1;
        else leadCount += 1;
      }
    }
  }

  return (
    <Card>
      <CardHeader
        title="All Contacts"
        subtitle="All person and organization records"
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Donors</p>
          <p className="text-2xl font-semibold text-slate-900">{donorCount}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Leads</p>
          <p className="text-2xl font-semibold text-slate-900">{leadCount}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Non-Leads</p>
          <p className="text-2xl font-semibold text-slate-900">{nonLeadCount}</p>
        </div>
      </div>
      <ContactsList
        title="All Contacts"
        subtitle="Unfiltered directory of contacts"
        contacts={contacts as Array<Record<string, unknown>>}
      />
    </Card>
  );
}
