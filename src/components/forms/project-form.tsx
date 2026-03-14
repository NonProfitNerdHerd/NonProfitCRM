"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ProjectForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, description, status })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setError(payload?.message ?? "Unable to create project.");
      setLoading(false);
      return;
    }

    setName("");
    setDescription("");
    setStatus("active");
    setLoading(false);
    router.refresh();
  }

  return (
    <form className="grid gap-3 md:grid-cols-4" onSubmit={onSubmit}>
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" />
      <Input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Description"
      />
      <select
        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        value={status}
        onChange={(event) => setStatus(event.target.value)}
      >
        <option value="active">Active</option>
        <option value="on_hold">On Hold</option>
        <option value="completed">Completed</option>
      </select>
      <Button type="submit" disabled={loading}>
        {loading ? "Saving..." : "Create Project"}
      </Button>
      {error ? <p className="text-sm text-red-700 md:col-span-4">{error}</p> : null}
    </form>
  );
}
