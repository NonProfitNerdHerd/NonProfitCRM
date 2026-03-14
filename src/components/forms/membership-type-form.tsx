"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MembershipTypeForm() {
  const router = useRouter();
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
    router.refresh();
  }

  return (
    <form className="grid gap-3 md:grid-cols-5" onSubmit={onSubmit}>
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
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Create Type"}
      </Button>
      {error ? <p className="text-sm text-red-700 md:col-span-5">{error}</p> : null}
    </form>
  );
}
