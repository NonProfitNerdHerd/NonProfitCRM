"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MembershipTypeForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    membershipLength: 12,
    lengthUnit: "months",
    status: "active"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/memberships/types", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to create membership type.");
      setLoading(false);
      return;
    }
    setForm({
      name: "",
      description: "",
      membershipLength: 12,
      lengthUnit: "months",
      status: "active"
    });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div>
      <Button type="button" onClick={() => setOpen(true)}>
        New Membership Type
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">New Membership Type</h3>
              <button
                type="button"
                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </div>

            <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Membership type name"
              />
              <Input
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="Description"
              />
              <Input
                type="number"
                min={1}
                value={form.membershipLength}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, membershipLength: Number(event.target.value || 1) }))
                }
              />
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.lengthUnit}
                onChange={(event) => setForm((prev) => ({ ...prev, lengthUnit: event.target.value }))}
              >
                <option value="days">Days</option>
                <option value="months">Months</option>
                <option value="years">Years</option>
              </select>
              <select
                className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <div className="md:col-span-2">
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : "Create Membership Type"}
                </Button>
              </div>
              {error ? <p className="text-sm text-red-700 md:col-span-2">{error}</p> : null}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
