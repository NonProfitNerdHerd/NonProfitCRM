"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";

type CampaignOption = { id: string; name: string };
type DonationRow = Record<string, unknown>;
type Mode = "create" | "info";

type DonorOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  organization_name: string | null;
  city: string | null;
  state: string | null;
};

type DonationForm = {
  donorId: string;
  organizationId: string;
  donationDate: string;
  totalAmount: string;
  paymentType: "Cash" | "Check" | "Card";
  checkNumber: string;
  transactionId: string;
  memo: string;
  sourceSystem: string;
  externalDonationId: string;
  recurring: boolean;
  allocations: Array<{ campaignId: string; amount: string }>;
};

type NewDonorForm = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  donorType: "Personal" | "Organization";
};

const EMPTY_DONATION_FORM: DonationForm = {
  donorId: "",
  organizationId: "",
  donationDate: "",
  totalAmount: "",
  paymentType: "Cash",
  checkNumber: "",
  transactionId: "",
  memo: "",
  sourceSystem: "Spreadsheet / Manual",
  externalDonationId: "",
  recurring: false,
  allocations: [{ campaignId: "", amount: "" }]
};

const EMPTY_NEW_DONOR_FORM: NewDonorForm = {
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  phone: "",
  donorType: "Personal"
};

function donorLabel(contact: DonorOption) {
  if (contact.organization_name?.trim()) return contact.organization_name;
  if (contact.preferred_name?.trim()) return contact.preferred_name;
  return `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Unnamed donor";
}

function donorDetails(contact: DonorOption) {
  const location = [contact.city?.trim(), contact.state?.trim()].filter(Boolean).join(", ");
  const bits = [location, contact.email?.trim(), contact.phone?.trim()].filter(Boolean);
  return bits.length > 0 ? bits.join(" • ") : "No city/state, email, or phone on file";
}

function getDonorFromRow(donation: DonationRow) {
  return (Array.isArray(donation.contacts) ? donation.contacts[0] : donation.contacts) as
    | Record<string, unknown>
    | null;
}

function getAllocationsFromRow(donation: DonationRow) {
  const rows = Array.isArray(donation.donation_allocations) ? donation.donation_allocations : [];
  const mapped = rows
    .map((row) => ({
      campaignId: String(row.campaign_id ?? ""),
      amount: String(row.allocation_amount ?? "")
    }))
    .filter((row) => row.campaignId);
  if (mapped.length > 0) return mapped;
  const fallbackCampaignId = String(donation.campaign_id ?? "");
  const fallbackAmount = String(donation.amount ?? "");
  return fallbackCampaignId && fallbackAmount
    ? [{ campaignId: fallbackCampaignId, amount: fallbackAmount }]
    : [{ campaignId: "", amount: "" }];
}

export function DonationsManagement({
  initialDonations,
  campaigns,
  detailBasePath,
  campaignBasePath,
  fixedContact,
  initialOpenDonationId
}: {
  initialDonations: DonationRow[];
  campaigns: CampaignOption[];
  detailBasePath: string;
  campaignBasePath: string;
  fixedContact?: { id: string; displayName: string };
  initialOpenDonationId?: string | null;
}) {
  const [rows, setRows] = useState(initialDonations);
  const [filters, setFilters] = useState({
    campaignId: "",
    paymentType: "",
    dateFrom: "",
    dateTo: "",
    donor: ""
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [displayLimit, setDisplayLimit] = useState<25 | 50 | 100>(25);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode | null>(null);
  const [selectedDonation, setSelectedDonation] = useState<DonationRow | null>(null);
  const [editingInfo, setEditingInfo] = useState(false);
  const editable = mode === "create" || (mode === "info" && editingInfo);

  const [form, setForm] = useState<DonationForm>(EMPTY_DONATION_FORM);
  const [donorOptions, setDonorOptions] = useState<DonorOption[]>([]);
  const [donorSearch, setDonorSearch] = useState("");
  const [donorDropdownOpen, setDonorDropdownOpen] = useState(false);
  const [donorLoading, setDonorLoading] = useState(false);
  const [newDonorMode, setNewDonorMode] = useState(false);
  const [newDonorForm, setNewDonorForm] = useState<NewDonorForm>(EMPTY_NEW_DONOR_FORM);
  const [hasAutoOpenedDonation, setHasAutoOpenedDonation] = useState(false);

  const totalAmountNumber = Number(form.totalAmount || 0);
  const visibleRows = useMemo(() => rows.slice(0, displayLimit), [rows, displayLimit]);
  const allocationTotal = useMemo(
    () =>
      form.allocations.reduce((sum, row) => {
        const value = Number(row.amount);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [form.allocations]
  );
  const remainingAmount = totalAmountNumber - allocationTotal;

  async function refreshRows(activeFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeFilters.campaignId) params.set("campaignId", activeFilters.campaignId);
    if (activeFilters.paymentType) params.set("paymentType", activeFilters.paymentType);
    if (activeFilters.dateFrom) params.set("dateFrom", activeFilters.dateFrom);
    if (activeFilters.dateTo) params.set("dateTo", activeFilters.dateTo);
    if (activeFilters.donor.trim()) params.set("donor", activeFilters.donor.trim());
    if (fixedContact?.id) params.set("contactId", fixedContact.id);
    const response = await fetch(`/api/donations?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (response.ok) setRows((payload?.donations ?? []) as DonationRow[]);
    else setError(payload?.message ?? "Unable to load donations.");
    setLoading(false);
  }

  async function searchDonors(searchValue?: string) {
    setDonorLoading(true);
    const params = new URLSearchParams();
    params.set("limit", "30");
    const q = (searchValue ?? donorSearch).trim();
    if (q) params.set("q", q);
    const response = await fetch(`/api/contacts?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (response.ok) setDonorOptions((payload?.contacts ?? []) as DonorOption[]);
    setDonorLoading(false);
  }

  async function handleDonorTypeahead(nextValue: string) {
    setDonorSearch(nextValue);
    setForm((prev) => ({ ...prev, donorId: "" }));
    setDonorDropdownOpen(true);
    await searchDonors(nextValue);
  }

  function chooseDonor(contact: DonorOption) {
    setForm((prev) => ({ ...prev, donorId: contact.id }));
    setDonorSearch(donorLabel(contact));
    setDonorDropdownOpen(false);
  }

  function resetFormState() {
    setForm(EMPTY_DONATION_FORM);
    setNewDonorMode(false);
    setNewDonorForm(EMPTY_NEW_DONOR_FORM);
    setDonorSearch("");
    setDonorDropdownOpen(false);
    setError(null);
  }

  async function openCreate() {
    resetFormState();
    if (fixedContact?.id) {
      setForm((prev) => ({ ...prev, donorId: fixedContact.id }));
      setDonorSearch(fixedContact.displayName);
    }
    setMode("create");
    setSelectedDonation(null);
    setEditingInfo(true);
    if (!fixedContact?.id) await searchDonors("");
  }

  async function openInfo(donation: DonationRow) {
    resetFormState();
    setMode("info");
    setSelectedDonation(donation);
    setEditingInfo(false);
    const donor = getDonorFromRow(donation);
    setForm({
      donorId: String(donor?.id ?? ""),
      organizationId: String(donation.crm_organization_id ?? ""),
      donationDate: String(donation.donation_date ?? ""),
      totalAmount: String(donation.amount ?? ""),
      paymentType: String(donation.payment_type ?? "Cash") as "Cash" | "Check" | "Card",
      checkNumber: String(donation.check_number ?? ""),
      transactionId: String(donation.transaction_id ?? ""),
      memo: String(donation.memo ?? ""),
      sourceSystem: String(donation.source_platform ?? "Spreadsheet / Manual"),
      externalDonationId: String(donation.external_transaction_id ?? ""),
      recurring: Boolean(donation.is_recurring ?? false),
      allocations: getAllocationsFromRow(donation)
    });
    if (donor) {
      const selectedDonor: DonorOption = {
        id: String(donor.id ?? ""),
        first_name: (donor.first_name as string | null) ?? null,
        last_name: (donor.last_name as string | null) ?? null,
        preferred_name: (donor.preferred_name as string | null) ?? null,
        email: (donor.email as string | null) ?? null,
        phone: (donor.phone as string | null) ?? null,
        organization_name: (donor.organization_name as string | null) ?? null,
        city: (donor.city as string | null) ?? null,
        state: (donor.state as string | null) ?? null
      };
      setDonorSearch(donorLabel(selectedDonor));
    } else if (fixedContact?.displayName) {
      setDonorSearch(fixedContact.displayName);
    }
    if (donor?.id) {
      setDonorOptions((prev) => [
        {
          id: String(donor.id),
          first_name: (donor.first_name as string | null) ?? null,
          last_name: (donor.last_name as string | null) ?? null,
          preferred_name: (donor.preferred_name as string | null) ?? null,
          email: (donor.email as string | null) ?? null,
          phone: (donor.phone as string | null) ?? null,
          organization_name: (donor.organization_name as string | null) ?? null,
          city: (donor.city as string | null) ?? null,
          state: (donor.state as string | null) ?? null
        },
        ...prev.filter((entry) => entry.id !== String(donor.id))
      ]);
    }
    setDonorDropdownOpen(false);
    if (!fixedContact?.id) {
      await searchDonors("");
    } else {
      setForm((prev) => ({ ...prev, donorId: fixedContact.id }));
      setDonorSearch(fixedContact.displayName);
    }
  }

  useEffect(() => {
    setHasAutoOpenedDonation(false);
  }, [initialOpenDonationId]);

  useEffect(() => {
    if (hasAutoOpenedDonation) return;
    const targetId = String(initialOpenDonationId ?? "").trim();
    if (!targetId) return;
    const match = rows.find((row) => String(row.id ?? "") === targetId);
    if (!match) return;
    setHasAutoOpenedDonation(true);
    void openInfo(match);
    // openInfo intentionally omitted: this effect should react to new open requests, not function identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenDonationId, rows, hasAutoOpenedDonation]);

  function closeModal() {
    setMode(null);
    setSelectedDonation(null);
    setEditingInfo(false);
    resetFormState();
  }

  async function createDonorIfNeeded() {
    if (fixedContact?.id) return fixedContact.id;
    if (!newDonorMode || mode !== "create") return form.donorId;
    const firstName = newDonorForm.firstName.trim();
    const displayName = newDonorForm.displayName.trim();
    const lastName = newDonorForm.lastName.trim();
    if (!firstName && !displayName) {
      throw new Error("First Name or Display Name is required for new donor creation.");
    }

    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        first_name: firstName || displayName,
        last_name: lastName || (newDonorForm.donorType === "Organization" ? "Organization" : "Donor"),
        preferred_name: displayName || undefined,
        email: newDonorForm.email.trim() || undefined,
        phone: newDonorForm.phone.trim() || undefined,
        organization_name: newDonorForm.donorType === "Organization" ? displayName || firstName : "",
        donor_status: "active",
        member_status: "none"
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message ?? "Unable to create donor.");
    const donorId = payload?.id as string;
    if (!donorId) throw new Error("Unable to create donor.");
    return donorId;
  }

  async function saveDonation(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const donorId = await createDonorIfNeeded();
      if (!donorId) throw new Error("Donor is required.");
      if (!form.donationDate) throw new Error("Donation Date is required.");
      if (!Number.isFinite(totalAmountNumber) || totalAmountNumber <= 0) {
        throw new Error("Total Donation Amount is required.");
      }
      if (form.paymentType === "Check" && !form.checkNumber.trim()) {
        throw new Error("Check Number is required for Check payments.");
      }
      if (form.paymentType === "Card" && !form.transactionId.trim()) {
        throw new Error("Transaction ID is required for Card payments.");
      }

      const allocations = form.allocations
        .map((row) => ({ campaignId: row.campaignId, amount: Number(row.amount) }))
        .filter((row) => row.campaignId && Number.isFinite(row.amount) && row.amount > 0);
      if (!allocations.length) throw new Error("At least one campaign allocation is required.");
      const seen = new Set<string>();
      for (const row of allocations) {
        if (seen.has(row.campaignId)) throw new Error("Each campaign can only appear once in allocation splits.");
        seen.add(row.campaignId);
      }
      const allocated = allocations.reduce((sum, row) => sum + row.amount, 0);
      if (Math.abs(allocated - totalAmountNumber) > 0.009) {
        throw new Error("Allocated split amounts must exactly match Total Donation Amount.");
      }

      const updating = mode === "info" && selectedDonation;
      const response = await fetch(updating ? `/api/donations/${String(selectedDonation.id)}` : "/api/donations", {
        method: updating ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: donorId,
          organizationId: form.organizationId || undefined,
          date: form.donationDate,
          totalAmount: totalAmountNumber,
          paymentType: form.paymentType,
          checkNumber: form.checkNumber || undefined,
          transactionId: form.transactionId || undefined,
          memo: form.memo || undefined,
          sourceSystem: form.sourceSystem || undefined,
          externalDonationId: form.externalDonationId || undefined,
          recurring: form.recurring,
          allocations
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message ?? "Unable to save donation.");

      await refreshRows();
      closeModal();
      setMessage(updating ? "Donation updated successfully." : "Donation saved successfully.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save donation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Donations Management</h3>
          <p className="text-sm text-slate-600">Filter, review, and manage individual donation records.</p>
        </div>
        <Button type="button" onClick={openCreate}>
          Add Donation
        </Button>
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!fixedContact ? (
        <section className="rounded-md border border-slate-200 p-4">
          <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Campaign</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={filters.campaignId}
              onChange={(event) => setFilters((prev) => ({ ...prev, campaignId: event.target.value }))}
            >
              <option value="">All Campaigns</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Payment Type</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={filters.paymentType}
              onChange={(event) => setFilters((prev) => ({ ...prev, paymentType: event.target.value }))}
            >
              <option value="">All Payment Types</option>
              <option value="Cash">Cash</option>
              <option value="Check">Check</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Donation Date From</label>
            <Input type="date" value={filters.dateFrom} onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Donation Date To</label>
            <Input type="date" value={filters.dateTo} onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Donor</label>
            <Input value={filters.donor} placeholder="Search donor..." onChange={(event) => setFilters((prev) => ({ ...prev, donor: event.target.value }))} />
          </div>
          </div>
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={() => refreshRows()}>
              {loading ? "Filtering..." : "Apply Filters"}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-slate-200 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Showing last {Math.min(visibleRows.length, displayLimit)} of {rows.length} donation entries
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600">Show</label>
            <select
              className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              value={displayLimit}
              onChange={(event) =>
                setDisplayLimit(Number(event.target.value) as 25 | 50 | 100)
              }
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="py-2">Donation Information</th>
                <th className="py-2">Date</th>
                <th className="py-2">Donor</th>
                <th className="py-2">Campaign Allocations</th>
                <th className="py-2">Amount</th>
                <th className="py-2">Payment</th>
                <th className="py-2">Reference</th>
                <th className="py-2">Created By</th>
                <th className="py-2">Entered At</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((donation) => {
                const donor = getDonorFromRow(donation);
                const allocations = Array.isArray(donation.donation_allocations) ? donation.donation_allocations : [];
                const allocationNames = allocations
                  .map((allocation) => {
                    const campaign = Array.isArray(allocation.campaigns) ? allocation.campaigns[0] : allocation.campaigns;
                    return (campaign?.name as string) ?? null;
                  })
                  .filter(Boolean) as string[];
                const fallbackCampaign = Array.isArray(donation.campaigns)
                  ? donation.campaigns[0]
                  : donation.campaigns;
                const campaignDisplay =
                  allocationNames.length > 0
                    ? allocationNames.join(", ")
                    : String(fallbackCampaign?.name ?? "-");
                const primaryCampaignId = allocations[0]?.campaign_id as string | undefined;
                return (
                  <tr className="border-b border-slate-100" key={String(donation.id)}>
                    <td className="py-2">
                      <Button type="button" variant="secondary" onClick={() => void openInfo(donation)}>
                        Donation Information
                      </Button>
                    </td>
                    <td className="py-2">
                      <button type="button" className="text-brand-700 underline" onClick={() => void openInfo(donation)}>
                        {formatDate(String(donation.donation_date ?? ""))}
                      </button>
                    </td>
                    <td className="py-2">
                      {fixedContact?.displayName
                        ? fixedContact.displayName
                        : `${String(donor?.first_name ?? "")} ${String(donor?.last_name ?? "")}`.trim() || "-"}
                    </td>
                    <td className="py-2">
                      {campaignDisplay !== "-" ? (
                        primaryCampaignId ? <Link href={`${campaignBasePath}/${primaryCampaignId}`}>{campaignDisplay}</Link> : campaignDisplay
                      ) : "-"}
                    </td>
                    <td className="py-2">{formatCurrency(Number(donation.amount ?? 0), donation.currency as string)}</td>
                    <td className="py-2">{String(donation.payment_type ?? "-")}</td>
                    <td className="py-2">{String(donation.check_number ?? donation.transaction_id ?? "-")}</td>
                    <td className="py-2">{String(donation.created_by ?? "-")}</td>
                    <td className="py-2">{formatDate(String(donation.created_at ?? ""))}</td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="py-3 text-sm text-slate-500" colSpan={9}>No donations found for current filters.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {mode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">{mode === "create" ? "Add Donation" : "Donation Information"}</h4>
              <button type="button" className="rounded-md border border-slate-200 px-2 py-1 text-xs" onClick={closeModal}>Close</button>
            </div>

            <form className="space-y-4" onSubmit={saveDonation}>
              <section className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Donor</p>
                  {mode === "create" && !fixedContact ? (
                    <Button type="button" variant="secondary" disabled={!editable} onClick={() => setNewDonorMode((prev) => !prev)}>
                      {newDonorMode ? "Use Existing Donor" : "Create New Donor"}
                    </Button>
                  ) : null}
                </div>
                {!newDonorMode || mode !== "create" ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">Donor</label>
                    {fixedContact?.id ? (
                      <Input value={fixedContact.displayName} disabled />
                    ) : (
                      <div className="relative">
                        <Input
                          value={donorSearch}
                          onChange={(event) => void handleDonorTypeahead(event.target.value)}
                          onFocus={() => {
                            if (!editable) return;
                            setDonorDropdownOpen(true);
                            void searchDonors(donorSearch);
                          }}
                          onBlur={() => {
                            window.setTimeout(() => setDonorDropdownOpen(false), 150);
                          }}
                          placeholder="Start typing donor name, city, state, email, or phone..."
                          disabled={!editable}
                        />
                        {editable && donorDropdownOpen ? (
                          <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
                            {donorLoading ? (
                              <p className="px-3 py-2 text-sm text-slate-500">Searching donors...</p>
                            ) : donorOptions.length === 0 ? (
                              <p className="px-3 py-2 text-sm text-slate-500">No donors found.</p>
                            ) : (
                              donorOptions.map((contact) => (
                                <button
                                  key={contact.id}
                                  type="button"
                                  className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => chooseDonor(contact)}
                                >
                                  <p className="text-sm font-medium text-slate-900">{donorLabel(contact)}</p>
                                  <p className="text-xs text-slate-600">{donorDetails(contact)}</p>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                    {!fixedContact?.id ? (
                      <p className="text-xs text-slate-500">
                        Matching results display name, city/state, email, and phone.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Donor Type</label><select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={newDonorForm.donorType} onChange={(event) => setNewDonorForm((prev) => ({ ...prev, donorType: event.target.value as "Personal" | "Organization" }))}><option value="Personal">Personal</option><option value="Organization">Organization</option></select></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Display Name</label><Input value={newDonorForm.displayName} onChange={(event) => setNewDonorForm((prev) => ({ ...prev, displayName: event.target.value }))} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">First Name</label><Input value={newDonorForm.firstName} onChange={(event) => setNewDonorForm((prev) => ({ ...prev, firstName: event.target.value }))} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Last Name</label><Input value={newDonorForm.lastName} onChange={(event) => setNewDonorForm((prev) => ({ ...prev, lastName: event.target.value }))} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Email</label><Input type="email" value={newDonorForm.email} onChange={(event) => setNewDonorForm((prev) => ({ ...prev, email: event.target.value }))} /></div>
                    <div><label className="mb-1 block text-sm font-medium text-slate-700">Phone</label><Input value={newDonorForm.phone} onChange={(event) => setNewDonorForm((prev) => ({ ...prev, phone: event.target.value }))} /></div>
                  </div>
                )}
              </section>

              <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold">Donation Details</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Donation Date</label><Input type="date" value={form.donationDate} onChange={(event) => setForm((prev) => ({ ...prev, donationDate: event.target.value }))} required disabled={!editable} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Total Donation Amount</label><Input type="number" step="0.01" value={form.totalAmount} onChange={(event) => setForm((prev) => ({ ...prev, totalAmount: event.target.value }))} required disabled={!editable} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Payment Type</label><select className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.paymentType} onChange={(event) => setForm((prev) => ({ ...prev, paymentType: event.target.value as "Cash" | "Check" | "Card", checkNumber: "", transactionId: "" }))} disabled={!editable}><option value="Cash">Cash</option><option value="Check">Check</option><option value="Card">Card / Credit</option></select></div>
                  {form.paymentType === "Check" ? <div><label className="mb-1 block text-sm font-medium text-slate-700">Check Number</label><Input value={form.checkNumber} onChange={(event) => setForm((prev) => ({ ...prev, checkNumber: event.target.value }))} required={editable} disabled={!editable} /></div> : null}
                  {form.paymentType === "Card" ? <div><label className="mb-1 block text-sm font-medium text-slate-700">Transaction ID</label><Input value={form.transactionId} onChange={(event) => setForm((prev) => ({ ...prev, transactionId: event.target.value }))} required={editable} disabled={!editable} /></div> : null}
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Source System</label><Input value={form.sourceSystem} onChange={(event) => setForm((prev) => ({ ...prev, sourceSystem: event.target.value }))} disabled={!editable} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">External Donation ID</label><Input value={form.externalDonationId} onChange={(event) => setForm((prev) => ({ ...prev, externalDonationId: event.target.value }))} disabled={!editable} /></div>
                  <div><label className="mb-1 block text-sm font-medium text-slate-700">Related Organization ID (optional)</label><Input value={form.organizationId} onChange={(event) => setForm((prev) => ({ ...prev, organizationId: event.target.value }))} disabled={!editable} /></div>
                  <div className="flex items-center gap-2"><input id="recurring-donation" type="checkbox" checked={form.recurring} onChange={(event) => setForm((prev) => ({ ...prev, recurring: event.target.checked }))} disabled={!editable} /><label htmlFor="recurring-donation" className="text-sm font-medium text-slate-700">Recurring Donation</label></div>
                  <div className="md:col-span-2"><label className="mb-1 block text-sm font-medium text-slate-700">Memo / Notes</label><textarea className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={form.memo} onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))} disabled={!editable} /></div>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Campaign Allocations / Donation Splits</p>
                  <Button type="button" variant="secondary" disabled={!editable} onClick={() => setForm((prev) => ({ ...prev, allocations: [...prev.allocations, { campaignId: "", amount: "" }] }))}>Add Split</Button>
                </div>
                <div className="space-y-2">
                  {form.allocations.map((allocation, index) => (
                    <div key={`${index}-${allocation.campaignId}`} className="grid gap-2 md:grid-cols-3">
                      <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={allocation.campaignId} onChange={(event) => setForm((prev) => ({ ...prev, allocations: prev.allocations.map((row, rowIndex) => rowIndex === index ? { ...row, campaignId: event.target.value } : row) }))} disabled={!editable}>
                        <option value="">Select Campaign</option>
                        {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
                      </select>
                      <Input type="number" step="0.01" value={allocation.amount} onChange={(event) => setForm((prev) => ({ ...prev, allocations: prev.allocations.map((row, rowIndex) => rowIndex === index ? { ...row, amount: event.target.value } : row) }))} placeholder="Allocation Amount" disabled={!editable} />
                      <Button type="button" variant="secondary" disabled={!editable} onClick={() => setForm((prev) => ({ ...prev, allocations: prev.allocations.length === 1 ? prev.allocations : prev.allocations.filter((_, rowIndex) => rowIndex !== index) }))}>Remove</Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                  <p className="rounded-md bg-slate-100 px-2 py-1">Total Donation Amount: {formatCurrency(totalAmountNumber)}</p>
                  <p className="rounded-md bg-slate-100 px-2 py-1">Total Allocated Amount: {formatCurrency(allocationTotal)}</p>
                  <p className={`rounded-md px-2 py-1 ${Math.abs(remainingAmount) <= 0.009 ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>Remaining Unallocated Amount: {formatCurrency(remainingAmount)}</p>
                </div>
              </section>

              <div className="flex flex-wrap gap-2">
                {editable ? (
                  <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
                ) : (
                  <Button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setEditingInfo(true);
                    }}
                  >
                    Edit Donation
                  </Button>
                )}
                {mode === "info" && selectedDonation ? (
                  <Link href={`${detailBasePath}/${String(selectedDonation.id)}`}>
                    <Button type="button" variant="secondary">Open Full Detail Page</Button>
                  </Link>
                ) : null}
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (mode === "info" && selectedDonation && editingInfo) {
                      void openInfo(selectedDonation);
                      return;
                    }
                    closeModal();
                  }}
                >
                  {editable ? "Cancel" : "Close"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
