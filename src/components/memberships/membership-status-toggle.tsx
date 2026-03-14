"use client";

import { useState } from "react";

export function MembershipStatusToggle({
  membershipId,
  initialStatus
}: {
  membershipId: string;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [saving, setSaving] = useState(false);

  async function onToggle() {
    const nextStatus = status === "active" ? "inactive" : "active";
    setSaving(true);
    const response = await fetch(`/api/memberships/${membershipId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: nextStatus })
    });
    if (response.ok) {
      setStatus(nextStatus);
    }
    setSaving(false);
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-sm">{status}</span>
      <button
        type="button"
        onClick={onToggle}
        className="rounded-md border border-slate-200 px-2 py-1 text-xs"
        disabled={saving}
      >
        {saving ? "Saving..." : status === "active" ? "Set Inactive" : "Set Active"}
      </button>
    </div>
  );
}
