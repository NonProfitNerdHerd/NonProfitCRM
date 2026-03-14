import { createClient } from "@/lib/supabase/server";
import { requireStaffPermission } from "@/lib/auth/guards";

export type SearchResultGroup = {
  contacts: Array<Record<string, unknown>>;
  donations: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  notes: Array<Record<string, unknown>>;
  organizations: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
};

export async function globalSearch(query: string): Promise<SearchResultGroup> {
  const context = await requireStaffPermission("can_view_dashboard");
  const supabase = await createClient();
  const q = query.trim();

  if (q.length < 2) {
    return {
      contacts: [],
      donations: [],
      tasks: [],
      notes: [],
      organizations: [],
      projects: []
    };
  }

  const pattern = `%${q}%`;
  const numericAmount = Number(q.replace(/[^0-9.]/g, ""));
  const [
    { data: contacts },
    { data: donationTextMatches },
    { data: donationAmountMatches },
    { data: tasks },
    { data: notes },
    { data: organizations },
    { data: projects }
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, first_name, last_name, email, phone")
      .eq("organization_id", context.organizationId)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(8),
    supabase
      .from("donations")
      .select("id, amount, donation_date, payment_type, check_number, transaction_id, contacts(first_name,last_name)")
      .eq("organization_id", context.organizationId)
      .or(`transaction_id.ilike.${pattern},check_number.ilike.${pattern},memo.ilike.${pattern}`)
      .limit(8),
    Number.isFinite(numericAmount) && numericAmount > 0
      ? supabase
          .from("donations")
          .select("id, amount, donation_date, payment_type, check_number, transaction_id, contacts(first_name,last_name)")
          .eq("organization_id", context.organizationId)
          .eq("amount", numericAmount)
          .limit(8)
      : Promise.resolve({ data: [] }),
    supabase
      .from("tasks")
      .select("id, title, description, due_date, status, contacts(first_name,last_name)")
      .eq("organization_id", context.organizationId)
      .or(`title.ilike.${pattern},description.ilike.${pattern}`)
      .limit(8),
    supabase
      .from("notes")
      .select("id, body, created_at, contact_id")
      .eq("organization_id", context.organizationId)
      .ilike("body", pattern)
      .limit(8),
    supabase
      .from("crm_organizations")
      .select("id, name, description")
      .eq("organization_id", context.organizationId)
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .limit(8),
    supabase
      .from("projects")
      .select("id, name, description, status")
      .eq("organization_id", context.organizationId)
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .limit(8)
  ]);

  const donationsMap = new Map<string, Record<string, unknown>>();
  for (const donation of [...(donationTextMatches ?? []), ...(donationAmountMatches ?? [])]) {
    donationsMap.set(String(donation.id), donation);
  }

  return {
    contacts: contacts ?? [],
    donations: Array.from(donationsMap.values()),
    tasks: tasks ?? [],
    notes: notes ?? [],
    organizations: organizations ?? [],
    projects: projects ?? []
  };
}
