"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TagTypeaheadMulti,
  type TagTypeaheadOption
} from "@/components/tags/tag-typeahead-multi";

function toText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLabel(value: unknown) {
  return toText(value).replace(/\s+/g, " ");
}

function normalizeKey(value: unknown) {
  return normalizeLabel(value).toLowerCase();
}

function resolveVolunteerTaxonomyOptions(
  tags: Array<{ id: string; name: string; label?: string; parentTagId?: string }>,
  rootName: string
) {
  const root = tags.find(
    (tag) => !tag.parentTagId && normalizeKey(tag.name) === normalizeKey(rootName)
  );
  if (!root) return [] as TagTypeaheadOption[];
  const rootLabelPrefix = `${rootName.toLowerCase()} /`;
  return tags
    .filter((tag) => {
      if (!tag.parentTagId || tag.id === root.id) return false;
      const normalizedLabel = toText(tag.label).toLowerCase();
      return tag.parentTagId === root.id || normalizedLabel.startsWith(rootLabelPrefix);
    })
    .map((tag) => ({
      id: tag.id,
      name: normalizeLabel(tag.name),
      label: tag.label
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

type VolunteerFormState = {
  id: string;
  volunteerStatus: string;
  availabilityPreferences: string;
  interests: TagTypeaheadOption[];
  skills: TagTypeaheadOption[];
  certifications: TagTypeaheadOption[];
  accommodations: string;
  physicalLimitations: string;
  transportationEligible: boolean;
  driverEligible: boolean;
  internalNotes: string;
  internalConcerns: string;
  burnoutFlag: boolean;
  cautionFlag: boolean;
  softBlacklistFlag: boolean;
  doNotScheduleUntil: string;
  backgroundCheckStatus: string;
  backgroundCheckExpiresAt: string;
  orientationCompletedAt: string;
  confidentialityAcknowledgedAt: string;
};

type TaxonomyOption = TagTypeaheadOption & { parentTagId?: string };

function defaultVolunteerForm(): VolunteerFormState {
  return {
    id: "",
    volunteerStatus: "prospective",
    availabilityPreferences: "",
    interests: [],
    skills: [],
    certifications: [],
    accommodations: "",
    physicalLimitations: "",
    transportationEligible: false,
    driverEligible: false,
    internalNotes: "",
    internalConcerns: "",
    burnoutFlag: false,
    cautionFlag: false,
    softBlacklistFlag: false,
    doNotScheduleUntil: "",
    backgroundCheckStatus: "pending",
    backgroundCheckExpiresAt: "",
    orientationCompletedAt: "",
    confidentialityAcknowledgedAt: ""
  };
}

export function ContactVolunteerProfileTab({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<VolunteerFormState>(defaultVolunteerForm());
  const [allTagOptions, setAllTagOptions] = useState<TaxonomyOption[]>([]);

  const interestTagOptions = useMemo(
    () => resolveVolunteerTaxonomyOptions(allTagOptions, "Interests"),
    [allTagOptions]
  );
  const skillTagOptions = useMemo(
    () => resolveVolunteerTaxonomyOptions(allTagOptions, "Skills"),
    [allTagOptions]
  );
  const certificationTagOptions = useMemo(
    () => resolveVolunteerTaxonomyOptions(allTagOptions, "Certifications"),
    [allTagOptions]
  );

  useEffect(() => {
    void loadVolunteerProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  async function loadVolunteerProfile() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/volunteer-coordination/volunteers?contactId=${encodeURIComponent(contactId)}`
      );
      const payload = (await response.json().catch(() => null)) as
        | {
            profile?: Record<string, unknown> | null;
            tags?: Array<Record<string, unknown>>;
            message?: string;
          }
        | null;
      if (!response.ok) {
        throw new Error(toText(payload?.message) || "Unable to load volunteer profile.");
      }

      const tags = (payload?.tags ?? []).map((tag) => ({
        id: toText(tag.id),
        name: normalizeLabel(tag.name),
        label: toText(tag.path) || normalizeLabel(tag.name),
        parentTagId: toText(tag.parent_tag_id)
      }));
      setAllTagOptions(tags);

      const byName = new Map(tags.map((tag) => [normalizeKey(tag.name), tag]));
      const profile = payload?.profile ?? null;
      if (!profile) {
        setForm(defaultVolunteerForm());
        return;
      }

      const mapNamesToOptions = (input: unknown) => {
        const values = Array.isArray(input) ? input.map((entry) => normalizeLabel(entry)).filter(Boolean) : [];
        return values.map((name) => {
          const existing = byName.get(normalizeKey(name));
          if (existing) return existing;
          return { id: `name:${name.toLowerCase()}`, name, label: name, parentTagId: "" };
        });
      };

      const availabilityRaw = profile.availability_preferences as Record<string, unknown> | null;
      setForm({
        id: toText(profile.id),
        volunteerStatus: toText(profile.volunteer_status) || "prospective",
        availabilityPreferences: toText(availabilityRaw?.text),
        interests: mapNamesToOptions(profile.interests),
        skills: mapNamesToOptions(profile.skills),
        certifications: mapNamesToOptions(profile.certifications),
        accommodations: toText(profile.accommodations),
        physicalLimitations: toText(profile.physical_limitations),
        transportationEligible: Boolean(profile.transportation_eligible),
        driverEligible: Boolean(profile.driver_eligible),
        internalNotes: toText(profile.internal_notes),
        internalConcerns: toText(profile.internal_concerns),
        burnoutFlag: Boolean(profile.burnout_flag),
        cautionFlag: Boolean(profile.caution_flag),
        softBlacklistFlag: Boolean(profile.soft_blacklist_flag),
        doNotScheduleUntil: toText(profile.do_not_schedule_until),
        backgroundCheckStatus: toText(profile.background_check_status) || "pending",
        backgroundCheckExpiresAt: toText(profile.background_check_expires_at),
        orientationCompletedAt: toText(profile.orientation_completed_at),
        confidentialityAcknowledgedAt: toText(profile.confidentiality_acknowledged_at)
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load volunteer profile.");
    } finally {
      setLoading(false);
    }
  }

  async function createVolunteerTaxonomyTag(rootName: string, value: string) {
    const response = await fetch("/api/volunteer-coordination/tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rootName,
        values: [value]
      })
    });
    const payload = (await response.json().catch(() => null)) as
      | { result?: Array<Record<string, unknown>>; message?: string }
      | null;
    if (!response.ok) {
      throw new Error(toText(payload?.message) || `Unable to create ${rootName} tag.`);
    }
    const created = payload?.result?.[0];
    const id = toText(created?.id);
    const name = normalizeLabel(created?.name || value);
    const label = toText(created?.path) || `${rootName} / ${name}`;
    if (!id) return null;
    const option = { id, name, label };
    setAllTagOptions((prev) =>
      prev.some((entry) => entry.id === option.id) ? prev : [...prev, { ...option, parentTagId: "" }]
    );
    return option;
  }

  async function saveVolunteerProfile() {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/volunteer-coordination/volunteers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: form.id || undefined,
          contactId,
          volunteerStatus: form.volunteerStatus,
          volunteerType: "individual",
          availabilityPreferences: form.availabilityPreferences
            ? { text: form.availabilityPreferences }
            : {},
          interests: form.interests.map((entry) => entry.name),
          skills: form.skills.map((entry) => entry.name),
          certifications: form.certifications.map((entry) => entry.name),
          accommodations: form.accommodations || null,
          physicalLimitations: form.physicalLimitations || null,
          transportationEligible: form.transportationEligible,
          driverEligible: form.driverEligible,
          internalNotes: form.internalNotes || null,
          internalConcerns: form.internalConcerns || null,
          burnoutFlag: form.burnoutFlag,
          cautionFlag: form.cautionFlag,
          softBlacklistFlag: form.softBlacklistFlag,
          doNotScheduleUntil: form.doNotScheduleUntil || null,
          backgroundCheckStatus: form.backgroundCheckStatus,
          backgroundCheckExpiresAt: form.backgroundCheckExpiresAt || null,
          orientationCompletedAt: form.orientationCompletedAt || null,
          confidentialityAcknowledgedAt: form.confidentialityAcknowledgedAt || null
        })
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) {
        throw new Error(toText(payload?.message) || "Unable to save volunteer profile.");
      }
      setMessage("Volunteer profile saved.");
      await loadVolunteerProfile();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save volunteer profile.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-md border border-slate-200 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Volunteer Profile</p>
        <Button type="button" onClick={() => void saveVolunteerProfile()} disabled={loading}>
          {loading ? "Saving..." : "Save Volunteer Profile"}
        </Button>
      </div>
      {message ? <p className="text-sm text-green-700">{message}</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Volunteer Status</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.volunteerStatus}
            onChange={(event) => setForm((prev) => ({ ...prev, volunteerStatus: event.target.value }))}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="prospective">Prospective</option>
            <option value="do_not_schedule">Do Not Schedule</option>
            <option value="soft_blacklisted">Soft Blacklisted</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Do Not Schedule Until</label>
          <Input
            type="date"
            value={form.doNotScheduleUntil}
            onChange={(event) => setForm((prev) => ({ ...prev, doNotScheduleUntil: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Background Check Status</label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.backgroundCheckStatus}
            onChange={(event) => setForm((prev) => ({ ...prev, backgroundCheckStatus: event.target.value }))}
          >
            <option value="pending">Pending</option>
            <option value="clear">Clear</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
            <option value="not_required">Not Required</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <TagTypeaheadMulti
          label="Interests"
          selected={form.interests}
          options={interestTagOptions}
          onChange={(value) => setForm((prev) => ({ ...prev, interests: value }))}
          onCreateOption={(value) => createVolunteerTaxonomyTag("Interests", value)}
          placeholder="Type an interest..."
        />
        <TagTypeaheadMulti
          label="Skills"
          selected={form.skills}
          options={skillTagOptions}
          onChange={(value) => setForm((prev) => ({ ...prev, skills: value }))}
          onCreateOption={(value) => createVolunteerTaxonomyTag("Skills", value)}
          placeholder="Type a skill..."
        />
        <TagTypeaheadMulti
          label="Certifications"
          selected={form.certifications}
          options={certificationTagOptions}
          onChange={(value) => setForm((prev) => ({ ...prev, certifications: value }))}
          onCreateOption={(value) => createVolunteerTaxonomyTag("Certifications", value)}
          placeholder="Type a certification..."
        />
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Availability Preferences</label>
          <textarea
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.availabilityPreferences}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, availabilityPreferences: event.target.value }))
            }
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Accommodations</label>
          <textarea
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.accommodations}
            onChange={(event) => setForm((prev) => ({ ...prev, accommodations: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Physical Limitations</label>
          <textarea
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.physicalLimitations}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, physicalLimitations: event.target.value }))
            }
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Background Check Expires</label>
          <Input
            type="date"
            value={form.backgroundCheckExpiresAt}
            onChange={(event) => setForm((prev) => ({ ...prev, backgroundCheckExpiresAt: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Orientation Completed</label>
          <Input
            type="date"
            value={form.orientationCompletedAt}
            onChange={(event) => setForm((prev) => ({ ...prev, orientationCompletedAt: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Confidentiality Ack Date</label>
          <Input
            type="date"
            value={form.confidentialityAcknowledgedAt}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, confidentialityAcknowledgedAt: event.target.value }))
            }
          />
        </div>
      </div>

      <div className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-3">
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={form.transportationEligible}
            onChange={(event) => setForm((prev) => ({ ...prev, transportationEligible: event.target.checked }))}
          />
          Transportation Eligible
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={form.driverEligible}
            onChange={(event) => setForm((prev) => ({ ...prev, driverEligible: event.target.checked }))}
          />
          Driver Eligible
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={form.burnoutFlag}
            onChange={(event) => setForm((prev) => ({ ...prev, burnoutFlag: event.target.checked }))}
          />
          Burnout Flag
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={form.cautionFlag}
            onChange={(event) => setForm((prev) => ({ ...prev, cautionFlag: event.target.checked }))}
          />
          Caution Flag
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={form.softBlacklistFlag}
            onChange={(event) => setForm((prev) => ({ ...prev, softBlacklistFlag: event.target.checked }))}
          />
          Soft Blacklist
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Internal Notes</label>
          <textarea
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.internalNotes}
            onChange={(event) => setForm((prev) => ({ ...prev, internalNotes: event.target.value }))}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Internal Concerns</label>
          <textarea
            className="min-h-20 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={form.internalConcerns}
            onChange={(event) => setForm((prev) => ({ ...prev, internalConcerns: event.target.value }))}
          />
        </div>
      </div>
    </div>
  );
}
