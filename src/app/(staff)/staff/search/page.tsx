import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card";
import { globalSearch } from "@/lib/data/search";
import { requireStaffPermission } from "@/lib/auth/guards";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function StaffSearchPage({ searchParams }: PageProps) {
  await requireStaffPermission("can_view_dashboard");
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const results = await globalSearch(query);

  return (
    <Card>
      <CardHeader title="Global Search" subtitle={`Results for "${query || "..."}"`} />
      <div className="space-y-4">
        <Section
          title="Contacts"
          rows={results.contacts}
          href={(row) => `/staff/contacts/${row.id as string}`}
          label={(row) =>
            `${(row.first_name as string) ?? ""} ${(row.last_name as string) ?? ""}`.trim()
          }
          subtitle={(row) => (row.email as string) ?? (row.phone as string) ?? ""}
        />
        <Section
          title="Donations"
          rows={results.donations}
          href={(row) => `/staff/donations/${row.id as string}`}
          label={(row) => `Donation $${row.amount as string}`}
          subtitle={(row) => (row.donation_date as string) ?? ""}
        />
        <Section
          title="Tasks"
          rows={results.tasks}
          href={(row) => `/staff/tasks/${row.id as string}`}
          label={(row) => (row.title as string) ?? "Task"}
          subtitle={(row) => (row.description as string) ?? ""}
        />
        <Section
          title="Notes"
          rows={results.notes}
          href={(row) => `/staff/contacts/${row.contact_id as string}?tab=activity`}
          label={(row) => (row.body as string) ?? "Note"}
        />
        <Section
          title="Organizations"
          rows={results.organizations}
          href={(row) => `/staff/organizations/${row.id as string}`}
          label={(row) => (row.name as string) ?? "Organization"}
          subtitle={(row) => (row.description as string) ?? ""}
        />
        <Section
          title="Projects"
          rows={results.projects}
          href={(row) => `/staff/projects/${row.id as string}`}
          label={(row) => (row.name as string) ?? "Project"}
          subtitle={(row) => (row.description as string) ?? ""}
        />
      </div>
    </Card>
  );
}

function Section({
  title,
  rows,
  href,
  label,
  subtitle
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  href: (row: Record<string, unknown>) => string;
  label: (row: Record<string, unknown>) => string;
  subtitle?: (row: Record<string, unknown>) => string;
}) {
  return (
    <section>
      <p className="mb-2 text-sm font-semibold text-slate-900">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No {title.toLowerCase()} matches.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <Link
              key={row.id as string}
              href={href(row)}
              className="block rounded-md border border-slate-200 px-3 py-2 hover:bg-slate-50"
            >
              <p className="text-sm font-medium text-slate-900">{label(row)}</p>
              {subtitle ? <p className="text-xs text-slate-500">{subtitle(row)}</p> : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
