"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/utils";

export function MembershipsTable({
  initialMemberships
}: {
  initialMemberships: Array<Record<string, unknown>>;
}) {
  const [memberships, setMemberships] = useState(initialMemberships);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function toggleStatus(id: string, currentStatus: string) {
    const nextStatus = currentStatus === "active" ? "inactive" : "active";
    setSavingId(id);
    const response = await fetch(`/api/memberships/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    if (response.ok) {
      setMemberships((prev) =>
        prev.map((membership) =>
          membership.id === id ? { ...membership, status: nextStatus } : membership
        )
      );
    }
    setSavingId(null);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-600">
            <th className="py-2">Member</th>
            <th className="py-2">Plan</th>
            <th className="py-2">Status</th>
            <th className="py-2">Level</th>
            <th className="py-2">Renewal</th>
            <th className="py-2">Toggle Active</th>
          </tr>
        </thead>
        <tbody>
          {memberships.map((membership) => {
            const contact = Array.isArray(membership.contacts)
              ? membership.contacts[0]
              : membership.contacts;
            const membershipType = Array.isArray(membership.membership_types)
              ? membership.membership_types[0]
              : membership.membership_types;
            const id = membership.id as string;
            const status = (membership.status as string) ?? "-";
            return (
              <tr className="border-b border-slate-100" key={id}>
                <td className="py-2">
                  <Link href={`/staff/memberships/${id}`}>
                    {contact?.first_name} {contact?.last_name}
                  </Link>
                </td>
                <td className="py-2">{membershipType?.name ?? "-"}</td>
                <td className="py-2">{status}</td>
                <td className="py-2">{(membership.level as string) ?? "-"}</td>
                <td className="py-2">{formatDate(membership.renewal_date as string)}</td>
                <td className="py-2">
                  <button
                    type="button"
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                    onClick={() => toggleStatus(id, status)}
                    disabled={savingId === id}
                  >
                    {savingId === id
                      ? "Saving..."
                      : status === "active"
                        ? "Set Inactive"
                        : "Set Active"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
