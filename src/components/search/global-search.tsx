"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Input } from "@/components/ui/input";

type SearchPayload = {
  results: {
    contacts: Array<Record<string, unknown>>;
    donations: Array<Record<string, unknown>>;
    campaigns: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
    notes: Array<Record<string, unknown>>;
    organizations: Array<Record<string, unknown>>;
    projects: Array<Record<string, unknown>>;
    memberships: Array<Record<string, unknown>>;
  };
};

function entityCount(results: SearchPayload["results"]) {
  return (
    results.contacts.length +
    results.donations.length +
    results.campaigns.length +
    results.tasks.length +
    results.notes.length +
    results.organizations.length +
    results.projects.length +
    results.memberships.length
  );
}

export function GlobalSearch() {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<SearchPayload | null>(null);

  function clearSearch() {
    setQuery("");
    setPayload(null);
    setOpen(false);
    setLoading(false);
  }

  useEffect(() => {
    if (query.trim().length < 2) {
      setPayload(null);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
      const data = await response.json();
      if (response.ok) {
        setPayload(data as SearchPayload);
        setOpen(true);
      }
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    clearSearch();
    // pathname changes when navigating to selected result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const total = useMemo(() => (payload ? entityCount(payload.results) : 0), [payload]);

  return (
    <div className="relative w-full max-w-xl">
      <Input
        value={query}
        onFocus={() => {
          if (payload) setOpen(true);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          if (!next.trim()) {
            setPayload(null);
            setOpen(false);
          }
        }}
        placeholder="Search contacts, donations, campaigns, tasks, notes, organizations, projects, memberships..."
      />
      {query ? (
        <button
          type="button"
          onClick={clearSearch}
          className="absolute right-16 top-2 rounded-md px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
          aria-label="Clear search"
        >
          ×
        </button>
      ) : null}
      {loading ? (
        <p className="absolute right-3 top-2.5 text-xs text-slate-500">Searching...</p>
      ) : null}

      {open && payload ? (
        <div className="absolute z-50 mt-2 max-h-[28rem] w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
            <span>Results</span>
            <Link href={`/staff/search?q=${encodeURIComponent(query)}`} onClick={clearSearch}>
              View all ({total})
            </Link>
          </div>

          <SearchSection
            title="Contacts"
            rows={payload.results.contacts}
            href={(row) => `/staff/contacts/${row.id as string}`}
            label={(row) =>
              `${(row.first_name as string) ?? ""} ${(row.last_name as string) ?? ""}`.trim()
            }
            subtitle={(row) => (row.email as string) ?? (row.phone as string) ?? ""}
            onSelect={clearSearch}
          />
          <SearchSection
            title="Donations"
            rows={payload.results.donations}
            href={(row) => `/staff/financial/donations/${row.id as string}`}
            label={(row) => `Donation $${row.amount as string} on ${(row.donation_date as string) ?? ""}`}
            subtitle={(row) =>
              ((row.contacts as Array<Record<string, unknown>>)?.[0]?.first_name as string) ?? ""
            }
            onSelect={clearSearch}
          />
          <SearchSection
            title="Campaigns"
            rows={payload.results.campaigns}
            href={(row) => `/staff/financial/campaigns/${row.id as string}`}
            label={(row) => (row.name as string) ?? "Campaign"}
            subtitle={(row) => `${(row.status as string) ?? ""} ${(row.description as string) ?? ""}`.trim()}
            onSelect={clearSearch}
          />
          <SearchSection
            title="Tasks"
            rows={payload.results.tasks}
            href={(row) => `/staff/tasks/${row.id as string}`}
            label={(row) => (row.title as string) ?? "Task"}
            subtitle={(row) => (row.description as string) ?? ""}
            onSelect={clearSearch}
          />
          <SearchSection
            title="Notes"
            rows={payload.results.notes}
            href={(row) => `/staff/contacts/${row.contact_id as string}?tab=activity`}
            label={(row) => (row.body as string) ?? "Note"}
            onSelect={clearSearch}
          />
          <SearchSection
            title="Organizations"
            rows={payload.results.organizations}
            href={(row) => `/staff/organizations/${row.id as string}`}
            label={(row) => (row.name as string) ?? "Organization"}
            subtitle={(row) => (row.description as string) ?? ""}
            onSelect={clearSearch}
          />
          <SearchSection
            title="Projects"
            rows={payload.results.projects}
            href={(row) => `/staff/projects/${row.id as string}`}
            label={(row) => (row.name as string) ?? "Project"}
            subtitle={(row) => (row.description as string) ?? ""}
            onSelect={clearSearch}
          />
          <SearchSection
            title="Memberships"
            rows={payload.results.memberships}
            href={(row) => `/staff/memberships/${row.id as string}`}
            label={(row) => {
              const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
              return `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() || "Membership";
            }}
            subtitle={(row) => {
              const type = Array.isArray(row.membership_types)
                ? row.membership_types[0]
                : row.membership_types;
              return `${type?.name ?? ""} • ${(row.status as string) ?? ""}`.trim();
            }}
            onSelect={clearSearch}
          />
        </div>
      ) : null}
    </div>
  );
}

function SearchSection({
  title,
  rows,
  href,
  label,
  subtitle,
  onSelect
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  href: (row: Record<string, unknown>) => string;
  label: (row: Record<string, unknown>) => string;
  subtitle?: (row: Record<string, unknown>) => string;
  onSelect: () => void;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="mb-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </p>
      <div className="space-y-1">
        {rows.map((row) => (
          <Link
            key={row.id as string}
            href={href(row)}
            onClick={onSelect}
            className="block rounded-md border border-slate-100 px-2 py-1 hover:bg-slate-50"
          >
            <p className="text-sm font-medium text-slate-900">{label(row)}</p>
            {subtitle ? (
              <p className="text-xs text-slate-500">{subtitle(row)}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </section>
  );
}
