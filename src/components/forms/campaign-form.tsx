"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CampaignForm() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "Active",
    startDate: "",
    endDate: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(form)
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to create campaign.");
      setLoading(false);
      return;
    }
    setForm({
      name: "",
      description: "",
      status: "Active",
      startDate: "",
      endDate: ""
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <form className="grid gap-3 md:grid-cols-5" onSubmit={onSubmit}>
      <Input
        value={form.name}
        onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        placeholder="Campaign name"
      />
      <Input
        value={form.description}
        onChange={(event) =>
          setForm((prev) => ({ ...prev, description: event.target.value }))
        }
        placeholder="Description"
      />
      <select
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={form.status}
        onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
      >
        <option value="Active">Active</option>
        <option value="Inactive">Inactive</option>
      </select>
      <Input
        type="date"
        value={form.startDate}
        onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
      />
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Create Campaign"}
      </Button>
      <Input
        type="date"
        value={form.endDate}
        onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
        placeholder="End date"
        className="md:col-span-2"
      />
      {error ? <p className="text-sm text-red-700 md:col-span-5">{error}</p> : null}
    </form>
  );
}
