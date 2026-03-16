"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ImportForm() {
  const [domain, setDomain] = useState<"contacts" | "donations">("contacts");
  const [sourcePlatform, setSourcePlatform] = useState("WebConnex");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);

    const text = await file.text();

    const response = await fetch("/api/imports/csv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        domain,
        sourcePlatform,
        fileName: file.name,
        csvText: text,
        mapping:
          domain === "contacts"
            ? {
                first_name: "first_name",
                last_name: "last_name",
                email: "email",
                phone: "phone",
                donor_status: "donor_status",
                member_status: "member_status",
                external_source_id: "external_source_id"
              }
            : {
                amount: "amount",
                currency: "currency",
                donation_date: "donation_date",
                status: "status",
                contact_external_source_id: "contact_external_source_id",
                external_transaction_id: "external_transaction_id"
              }
      })
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setError(payload?.message ?? "Import failed.");
    } else {
      const payload = await response.json();
      setMessage(
        `Import finished: ${payload.successCount} success, ${payload.failureCount} failed`
      );
    }
    setLoading(false);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Domain</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={domain}
            onChange={(event) =>
              setDomain(event.target.value as "contacts" | "donations")
            }
          >
            <option value="contacts">Contacts</option>
            <option value="donations">Donations</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Source Platform</label>
          <Input
            value={sourcePlatform}
            onChange={(event) => setSourcePlatform(event.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">CSV File</label>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <Button disabled={loading || !file} type="submit">
        {loading ? "Processing..." : "Run Import"}
      </Button>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
