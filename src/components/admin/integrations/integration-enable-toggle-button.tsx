"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function IntegrationEnableToggleButton({
  integrationKey,
  initialIsEnabled
}: {
  integrationKey: string;
  initialIsEnabled: boolean;
}) {
  const [isEnabled, setIsEnabled] = useState(initialIsEnabled);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const next = !isEnabled;
      const response = await fetch(`/api/admin/integrations/${encodeURIComponent(integrationKey)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isEnabled: next })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Unable to update integration state.");
      }
      setIsEnabled(next);
      window.location.reload();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update integration state.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant={isEnabled ? "danger" : "primary"} onClick={() => void toggle()} disabled={loading}>
        {loading ? (isEnabled ? "Disabling..." : "Enabling...") : isEnabled ? "Disable Integration" : "Enable Integration"}
      </Button>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </div>
  );
}
