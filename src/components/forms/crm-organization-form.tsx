"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CrmOrganizationForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const response = await fetch("/api/organizations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to create organization.");
      setLoading(false);
      return;
    }
    setName("");
    setDescription("");
    setLoading(false);
    router.refresh();
  }

  return (
    <form className="grid gap-3 md:grid-cols-3" onSubmit={onSubmit}>
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Organization name" />
      <Input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description"
      />
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Create Organization"}
      </Button>
      {error ? <p className="text-sm text-red-700 md:col-span-3">{error}</p> : null}
    </form>
  );
}
