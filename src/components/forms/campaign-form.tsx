"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TagMultiSelectAutocomplete, type TagMultiSelectOption } from "@/components/tags/tag-multi-select-autocomplete";
import {
  ensureTagAutocompleteOption,
  searchTagAutocompleteOptions
} from "@/lib/tags/tag-autocomplete-client";

export type CampaignFormPayload = {
  name: string;
  description?: string;
  status: "Active" | "Inactive";
  startDate?: string;
  endDate?: string;
  campaignTagId: string;
};

type CampaignFormValues = {
  name: string;
  description: string;
  status: "Active" | "Inactive";
  startDate: string;
  endDate: string;
  campaignTagId: string;
  campaignTagLabel?: string;
};

export function CampaignForm({
  onSubmitCampaign,
  onSuccess,
  onCancel,
  initialValues,
  submitLabel = "Save",
  requireDateRange = false,
  parentDateBounds
}: {
  onSubmitCampaign: (payload: CampaignFormPayload) => Promise<void>;
  onSuccess: () => Promise<void> | void;
  onCancel: () => void;
  initialValues?: Partial<CampaignFormValues>;
  submitLabel?: string;
  requireDateRange?: boolean;
  parentDateBounds?: {
    startDate: string | null;
    endDate: string | null;
  };
}) {
  const [form, setForm] = useState({
    name: initialValues?.name ?? "",
    description: initialValues?.description ?? "",
    status: initialValues?.status ?? "Active",
    startDate: initialValues?.startDate ?? "",
    endDate: initialValues?.endDate ?? ""
  });
  const [selectedCampaignTag, setSelectedCampaignTag] = useState<TagMultiSelectOption[]>(
    initialValues?.campaignTagId
      ? [
          {
            id: initialValues.campaignTagId,
            name: initialValues.campaignTagLabel ?? "Campaign Tag",
            label: initialValues.campaignTagLabel ?? "Campaign Tag"
          }
        ]
      : []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (!form.name.trim()) {
      setError("Campaign Name is required.");
      setLoading(false);
      return;
    }
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      setError("End Date cannot be before Start Date.");
      setLoading(false);
      return;
    }
    if (requireDateRange && (!form.startDate || !form.endDate)) {
      setError("Start Date and End Date are required.");
      setLoading(false);
      return;
    }
    if (
      parentDateBounds?.startDate &&
      form.startDate &&
      form.startDate < parentDateBounds.startDate
    ) {
      setError("Child Campaign Start Date cannot be before Parent Campaign Start Date.");
      setLoading(false);
      return;
    }
    if (parentDateBounds?.endDate && form.endDate && form.endDate > parentDateBounds.endDate) {
      setError("Child Campaign End Date cannot be after Parent Campaign End Date.");
      setLoading(false);
      return;
    }
    if (!selectedCampaignTag[0]?.id) {
      setError("Campaign Tag is required.");
      setLoading(false);
      return;
    }

    try {
      await onSubmitCampaign({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        status: form.status as "Active" | "Inactive",
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        campaignTagId: selectedCampaignTag[0].id
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to save campaign.");
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
    setSelectedCampaignTag([]);
    setLoading(false);
    await onSuccess();
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Campaign Name *
          </label>
          <Input
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Campaign name"
            required
          />
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
            placeholder="Describe this campaign..."
            rows={4}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
          />
        </div>

        <div className="md:col-span-2">
          <TagMultiSelectAutocomplete
            label="Campaign Tag *"
            selected={selectedCampaignTag}
            onChange={(next) => setSelectedCampaignTag(next.slice(0, 1))}
            loadOptions={(value) =>
              searchTagAutocompleteOptions({
                query: value,
                activeOnly: true,
                limit: 20,
                module: "contacts"
              })
            }
            onCreateOption={(value) =>
              ensureTagAutocompleteOption({
                name: value,
                module: "contacts"
              })
            }
            placeholder="Select or create a campaign tag"
            emptyHint="No matching tags."
            maxSelections={1}
          />
          <p className="mt-1 text-xs text-slate-500">
            This tag is applied automatically to donations and donor records for this campaign.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.status}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                status: event.target.value as "Active" | "Inactive"
              }))
            }
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Start Date {requireDateRange ? "*" : "(optional)"}
          </label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            End Date {requireDateRange ? "*" : "(optional)"}
          </label>
          <Input
            type="date"
            value={form.endDate}
            onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={loading}>
          {loading ? "Saving..." : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
