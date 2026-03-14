"use client";

import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/utils";

type CampaignOption = { id: string; name: string };

type DonationRow = Record<string, unknown>;

type DonorOption = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  organization_name: string | null;
};

type DonationCreateForm = {
  donorId: string;
  donationDate: string;
  totalAmount: string;
  paymentType: "Cash" | "Check" | "Card";
  checkNumber: string;
  transactionId: string;
  memo: string;
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

function donorLabel(contact: DonorOption) {
  if (contact.organization_name && contact.organization_name.trim()) {
    return contact.organization_name;
  }
  const preferred = contact.preferred_name?.trim();
  if (preferred) return preferred;
  return `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() || "Unnamed donor";
}

export function DonationsManagement({
  initialDonations,
  campaigns,
  detailBasePath,
  campaignBasePath
}: {
  initialDonations: DonationRow[];
  campaigns: CampaignOption[];
  detailBasePath: string;
  campaignBasePath: string;
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
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [donorSearch, setDonorSearch] = useState("");
  const [donorOptions, setDonorOptions] = useState<DonorOption[]>([]);
  const [newDonorMode, setNewDonorMode] = useState(false);
  const [newDonorForm, setNewDonorForm] = useState<NewDonorForm>({
    firstName: "",
    lastName: "",
    displayName: "",
    email: "",
    phone: "",
    donorType: "Personal"
  });
  const [form, setForm] = useState<DonationCreateForm>({
    donorId: "",
    donationDate: "",
    totalAmount: "",
    paymentType: "Cash",
    checkNumber: "",
    transactionId: "",
    memo: "",
    allocations: [{ campaignId: "", amount: "" }]
  });

  const allocationTotal = useMemo(
    () =>
      form.allocations.reduce((sum, row) => {
        const value = Number(row.amount);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [form.allocations]
  );
  const totalAmountNumber = Number(form.totalAmount || 0);
  const remainingAmount = totalAmountNumber - allocationTotal;

  async function refreshRows(activeFilters = filters) {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeFilters.campaignId) params.set("campaignId", activeFilters.campaignId);
    if (activeFilters.paymentType) params.set("paymentType", activeFilters.paymentType);
    if (activeFilters.dateFrom) params.set("dateFrom", activeFilters.dateFrom);
    if (activeFilters.dateTo) params.set("dateTo", activeFilters.dateTo);
    if (activeFilters.donor.trim()) params.set("donor", activeFilters.donor.trim());
    const response = await fetch(`/api/donations?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setRows((payload?.donations ?? []) as DonationRow[]);
    } else {
      setError(payload?.message ?? "Unable to load donations.");
    }
    setLoading(false);
  }

  async function searchDonors() {
    const params = new URLSearchParams();
    params.set("limit", "30");
    if (donorSearch.trim()) params.set("q", donorSearch.trim());
    const response = await fetch(`/api/contacts?${params.toString()}`);
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      setDonorOptions((payload?.contacts ?? []) as DonorOption[]);
    }
  }

  function resetDonationForm() {
    setForm({
      donorId: "",
      donationDate: "",
      totalAmount: "",
      paymentType: "Cash",
      checkNumber: "",
      transactionId: "",
      memo: "",
      allocations: [{ campaignId: "", amount: "" }]
    });
    setNewDonorMode(false);
    setNewDonorForm({
      firstName: "",
      lastName: "",
      displayName: "",
      email: "",
      phone: "",
      donorType: "Personal"
    });
    setDonorSearch("");
    setError(null);
    setMessage(null);
  }

  async function createDonorIfNeeded() {
    if (!newDonorMode) return form.donorId;
    const firstName = newDonorForm.firstName.trim();
    const lastName = newDonorForm.lastName.trim();
    const displayName = newDonorForm.displayName.trim();
    if (!firstName && !displayName) {
      throw new Error("First Name or Display Name is required for new donor creation.");
    }

    const response = await fetch("/api/contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        first_name: firstName || displayName,
        last_name:
          lastName ||
          (newDonorForm.donorType === "Organization" ? "Organization" : "Donor"),
        preferred_name: displayName || undefined,
        email: newDonorForm.email.trim() || undefined,
        phone: newDonorForm.phone.trim() || undefined,
        organization_name:
          newDonorForm.donorType === "Organization" ? displayName || firstName : "",
        donor_status: "active",
        member_status: "none"
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.message ?? "Unable to create donor.");
    }
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

      const normalizedAllocations = form.allocations
        .map((row) => ({
          campaignId: row.campaignId,
          amount: Number(row.amount)
        }))
        .filter((row) => row.campaignId && Number.isFinite(row.amount) && row.amount > 0);
      if (normalizedAllocations.length === 0) {
        throw new Error("At least one campaign allocation is required.");
      }

      const seenCampaigns = new Set<string>();
      for (const allocation of normalizedAllocations) {
        if (seenCampaigns.has(allocation.campaignId)) {
          throw new Error("Each campaign can only appear once in allocation splits.");
        }
        seenCampaigns.add(allocation.campaignId);
      }

      const allocated = normalizedAllocations.reduce((sum, row) => sum + row.amount, 0);
      if (Math.abs(allocated - totalAmountNumber) > 0.009) {
        throw new Error("Allocated split amounts must exactly match Total Donation Amount.");
      }

      const response = await fetch("/api/donations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: donorId,
          date: form.donationDate,
          totalAmount: totalAmountNumber,
          paymentType: form.paymentType,
          checkNumber: form.checkNumber || undefined,
          transactionId: form.transactionId || undefined,
          memo: form.memo || undefined,
          allocations: normalizedAllocations
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to add donation.");
      }

      setShowModal(false);
      setMessage("Donation saved successfully.");
      await refreshRows();
      resetDonationForm();
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
          <p className="text-sm text-slate-600">
            Filter, review, and manage individual donation records.
          </p>
        </div>
        <Button
          type="button"
          onClick={async () => {
            resetDonationForm();
            await searchDonors();
            setShowModal(true);
          }}
        >
          Add Donation
        </Button>
      </div>

      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <section className="rounded-md border border-slate-200 p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Campaign</label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={filters.campaignId}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, campaignId: event.target.value }))
              }
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
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, paymentType: event.target.value }))
              }
            >
              <option value="">All Payment Types</option>
              <option value="Cash">Cash</option>
              <option value="Check">Check</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Donation Date From</label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, dateFrom: event.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Donation Date To</label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Donor</label>
            <Input
              value={filters.donor}
              placeholder="Search donor..."
              onChange={(event) => setFilters((prev) => ({ ...prev, donor: event.target.value }))}
            />
          </div>
        </div>
        <div className="mt-3">
          <Button type="button" variant="secondary" onClick={() => refreshRows()}>
            {loading ? "Filtering..." : "Apply Filters"}
          </Button>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
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
              {rows.map((donation) => {
                const donor = Array.isArray(donation.contacts) ? donation.contacts[0] : donation.contacts;
                const allocations = Array.isArray(donation.donation_allocations)
                  ? donation.donation_allocations
                  : [];
                const allocationNames = allocations
                  .map((allocation) => {
                    const campaign = Array.isArray(allocation.campaigns)
                      ? allocation.campaigns[0]
                      : allocation.campaigns;
                    return (campaign?.name as string) ?? null;
                  })
                  .filter(Boolean) as string[];
                const primaryCampaignId = allocations[0]?.campaign_id as string | undefined;

                return (
                  <tr className="border-b border-slate-100" key={String(donation.id)}>
                    <td className="py-2">
                      <Link href={`${detailBasePath}/${String(donation.id)}`}>
                        {formatDate(donation.donation_date as string)}
                      </Link>
                    </td>
                    <td className="py-2">
                      {String(donor?.first_name ?? "")} {String(donor?.last_name ?? "")}
                    </td>
                    <td className="py-2">
                      {allocationNames.length > 0 ? (
                        primaryCampaignId ? (
                          <Link href={`${campaignBasePath}/${primaryCampaignId}`}>
                            {allocationNames.join(", ")}
                          </Link>
                        ) : (
                          allocationNames.join(", ")
                        )
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2">{formatCurrency(Number(donation.amount ?? 0), donation.currency as string)}</td>
                    <td className="py-2">{String(donation.payment_type ?? "-")}</td>
                    <td className="py-2">
                      {String(donation.check_number ?? donation.transaction_id ?? "-")}
                    </td>
                    <td className="py-2">{String(donation.created_by ?? "-")}</td>
                    <td className="py-2">{formatDate(String(donation.created_at ?? ""))}</td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td className="py-3 text-sm text-slate-500" colSpan={8}>
                    No donations found for current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base font-semibold text-slate-900">Add Donation</h4>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => {
                  setShowModal(false);
                  resetDonationForm();
                }}
              >
                Close
              </button>
            </div>

            <form className="space-y-4" onSubmit={saveDonation}>
              <section className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Donor</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setNewDonorMode((prev) => !prev)}
                  >
                    {newDonorMode ? "Use Existing Donor" : "Create New Donor"}
                  </Button>
                </div>

                {!newDonorMode ? (
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Search Existing Donor
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={donorSearch}
                        onChange={(event) => setDonorSearch(event.target.value)}
                        placeholder="Search by name, email, phone..."
                      />
                      <Button type="button" variant="secondary" onClick={searchDonors}>
                        Search
                      </Button>
                    </div>
                    <label className="block text-sm font-medium text-slate-700">Donor</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={form.donorId}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, donorId: event.target.value }))
                      }
                    >
                      <option value="">Select donor</option>
                      {donorOptions.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {donorLabel(contact)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Donor Type</label>
                      <select
                        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={newDonorForm.donorType}
                        onChange={(event) =>
                          setNewDonorForm((prev) => ({
                            ...prev,
                            donorType: event.target.value as "Personal" | "Organization"
                          }))
                        }
                      >
                        <option value="Personal">Personal</option>
                        <option value="Organization">Organization</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Display Name</label>
                      <Input
                        value={newDonorForm.displayName}
                        onChange={(event) =>
                          setNewDonorForm((prev) => ({ ...prev, displayName: event.target.value }))
                        }
                        placeholder="Display name"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">First Name</label>
                      <Input
                        value={newDonorForm.firstName}
                        onChange={(event) =>
                          setNewDonorForm((prev) => ({ ...prev, firstName: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Last Name</label>
                      <Input
                        value={newDonorForm.lastName}
                        onChange={(event) =>
                          setNewDonorForm((prev) => ({ ...prev, lastName: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                      <Input
                        type="email"
                        value={newDonorForm.email}
                        onChange={(event) =>
                          setNewDonorForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Phone</label>
                      <Input
                        value={newDonorForm.phone}
                        onChange={(event) =>
                          setNewDonorForm((prev) => ({ ...prev, phone: event.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-md border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold">Donation Details</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Donation Date</label>
                    <Input
                      type="date"
                      value={form.donationDate}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, donationDate: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Total Donation Amount
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      value={form.totalAmount}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, totalAmount: event.target.value }))
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Payment Type</label>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={form.paymentType}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          paymentType: event.target.value as "Cash" | "Check" | "Card",
                          checkNumber: "",
                          transactionId: ""
                        }))
                      }
                    >
                      <option value="Cash">Cash</option>
                      <option value="Check">Check</option>
                      <option value="Card">Card / Credit</option>
                    </select>
                  </div>
                  {form.paymentType === "Check" ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Check Number</label>
                      <Input
                        value={form.checkNumber}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, checkNumber: event.target.value }))
                        }
                        required
                      />
                    </div>
                  ) : null}
                  {form.paymentType === "Card" ? (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">Transaction ID</label>
                      <Input
                        value={form.transactionId}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, transactionId: event.target.value }))
                        }
                        required
                      />
                    </div>
                  ) : null}
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Memo / Notes</label>
                    <textarea
                      className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                      value={form.memo}
                      onChange={(event) => setForm((prev) => ({ ...prev, memo: event.target.value }))}
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-md border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold">Campaign Allocations / Donation Splits</p>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        allocations: [...prev.allocations, { campaignId: "", amount: "" }]
                      }))
                    }
                  >
                    Add Split
                  </Button>
                </div>
                <div className="space-y-2">
                  {form.allocations.map((allocation, index) => (
                    <div key={`${index}-${allocation.campaignId}`} className="grid gap-2 md:grid-cols-3">
                      <select
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                        value={allocation.campaignId}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            allocations: prev.allocations.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, campaignId: event.target.value } : row
                            )
                          }))
                        }
                      >
                        <option value="">Select Campaign</option>
                        {campaigns.map((campaign) => (
                          <option key={campaign.id} value={campaign.id}>
                            {campaign.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        step="0.01"
                        value={allocation.amount}
                        onChange={(event) =>
                          setForm((prev) => ({
                            ...prev,
                            allocations: prev.allocations.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, amount: event.target.value } : row
                            )
                          }))
                        }
                        placeholder="Allocation Amount"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            allocations:
                              prev.allocations.length === 1
                                ? prev.allocations
                                : prev.allocations.filter((_, rowIndex) => rowIndex !== index)
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                  <p className="rounded-md bg-slate-100 px-2 py-1">
                    Total Donation Amount: {formatCurrency(totalAmountNumber)}
                  </p>
                  <p className="rounded-md bg-slate-100 px-2 py-1">
                    Total Allocated Amount: {formatCurrency(allocationTotal)}
                  </p>
                  <p
                    className={`rounded-md px-2 py-1 ${
                      Math.abs(remainingAmount) <= 0.009
                        ? "bg-green-100 text-green-800"
                        : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    Remaining Unallocated Amount: {formatCurrency(remainingAmount)}
                  </p>
                </div>
              </section>

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowModal(false);
                    resetDonationForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
